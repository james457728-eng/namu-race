import express from 'express';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const app = express();

app.get('/', (req, res) => {
    res.send(`
        <div style="text-align:center; padding:50px; font-family:sans-serif; background:#f0f2f5; height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center;">
            <div style="background:white; padding:40px; border-radius:15px; box-shadow:0 10px 25px rgba(0,0,0,0.1); width: 400px;">
                <h1 style="color:#00a495; margin-bottom:10px;">🌲 나무위키 레이스</h1>
                <p style="color:#666; margin-bottom:30px;">최종 우회 버전 (로딩 김)</p>
                <form action="/start" method="GET" style="display:flex; flex-direction:column; gap:10px;">
                    <input type="text" name="start" placeholder="🚩 출발 (예: 아이유)" required style="padding:15px; border:1px solid #ddd; border-radius:8px; font-size:16px;">
                    <input type="text" name="goal" placeholder="🏁 도착 (예: 대한민국)" required style="padding:15px; border:1px solid #ddd; border-radius:8px; font-size:16px;">
                    <button type="submit" style="padding:15px; background:#00a495; color:white; border:none; border-radius:8px; font-size:18px; cursor:pointer; font-weight:bold;">게임 시작</button>
                </form>
            </div>
        </div>
    `);
});

app.get('/start', (req, res) => {
    const start = req.query.start;
    const goal = req.query.goal;
    res.redirect(`/game/${encodeURIComponent(start)}?goal=${encodeURIComponent(goal || '')}&count=0`);
});

app.get('/gameover', (req, res) => {
    res.send('<h1>시간 초과!</h1><a href="/">다시 하기</a>');
});

app.get(/^\/game\/(.*)/, async (req, res) => {
    let keyword = req.params[0];
    if (keyword.includes('?')) keyword = keyword.split('?')[0];
    try { keyword = decodeURIComponent(keyword); } catch(e) {}

    const goal = req.query.goal || ""; 
    const count = parseInt(req.query.count) || 0;
    const targetUrl = `https://namu.wiki/w/${encodeURIComponent(keyword)}`;

    console.log(`🌲 이동 시도: ${keyword} (보안 뚫는 중... 최대 30초 소요)`);

    // 승리 판정
    if (goal && keyword.replace(/_/g, ' ').trim() === goal.replace(/_/g, ' ').trim()) {
        return res.send(`<h1>🎉 도착! ${count}회 이동.</h1><a href="/">다시 하기</a>`);
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', // 메모리 부족 방지
                '--disable-gpu',
                '--no-zygote', // 좀비 프로세스 방지
                '--single-process' // 중요: Render 무료 서버용 설정
            ]
        });

        const page = await browser.newPage();
        
        // 1. 사람인 척 위장
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // 2. 접속 시도
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // 3. [핵심] "Just a moment" 화면이 사라지고 진짜 글씨(h1)가 뜰 때까지 대기
        console.log('⏳ Cloudflare 대기 중...');
        try {
            // 'app' 아이디나 'article' 태그가 뜰 때까지 최대 15초 기다림
            await page.waitForSelector('#app', { timeout: 15000 });
            console.log('✅ 뚫기 성공! 내용 가져옵니다.');
        } catch (waitError) {
            console.log('⚠️ 대기 시간 초과! (캡챠 걸렸을 수도 있음)');
        }

        const content = await page.content();
        const $ = cheerio.load(content);

        // --- 여기서부터 청소 및 변환 (기존 동일) ---
        $('base').remove();
        $('head').prepend('<meta name="referrer" content="no-referrer">');
        
        $('link[rel="stylesheet"]').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.startsWith('/')) $(el).attr('href', `https://namu.wiki${href}`);
        });

        $('img').each((i, el) => {
            const src = $(el).attr('src');
            const dataSrc = $(el).attr('data-src');
            if (dataSrc) {
                $(el).attr('src', dataSrc.startsWith('/') ? `https://namu.wiki${dataSrc}` : dataSrc).removeAttr('data-src');
            } else if (src && src.startsWith('/')) {
                $(el).attr('src', `https://namu.wiki${src}`);
            }
            $(el).css('max-width', '100%').css('height', 'auto');
        });

        $('script, noscript, iframe, nav, .s-alert').remove(); 
        $('[class*="Sidebar"]').remove();
        $('*').removeAttr('onclick'); 

        $('a').each((i, el) => {
            let href = $(el).attr('href');
            if (!href) return;
            if (href.startsWith('/w/') && !href.includes('/w/파일:') && !href.includes('/w/분류:') && !href.includes('/w/특수:')) {
                const nextKeyword = href.replace('/w/', '');
                $(el).attr('href', `/game/${nextKeyword}?goal=${encodeURIComponent(goal)}&count=${count + 1}`);
            } else {
                $(el).removeAttr('href').css('opacity', '0.5');
            }
        });

        $('body').prepend(`
            <div style="position:fixed; top:0; left:0; width:100%; background:rgba(0,0,0,0.85); color:white; padding:10px; text-align:center; z-index:9999999; backdrop-filter:blur(5px); border-bottom: 2px solid #00a495;">
                <div style="display:flex; justify-content:center; gap:20px; align-items:center; font-size:1.1em;">
                    <div>📍 ${keyword}</div>
                    <div>🎯 ${goal}</div>
                    <div>👣 ${count}회</div>
                    <div>⏰ <span id="timer" style="color:gold;">30</span></div>
                </div>
            </div>
            <div style="height:50px;"></div>
            <script>
                let time = 30;
                setInterval(() => {
                    time--;
                    document.getElementById('timer').innerText = time;
                    if(time <= 0) window.location.href = '/gameover';
                }, 1000);
            </script>
        `);

        res.send($.html());

    } catch (e) {
        console.error(e);
        res.send(`<h2>접속 실패...</h2><p>나무위키 보안이 너무 강력합니다 ㅠㅠ<br>에러 내용: ${e.message}</p>`);
    } finally {
        if (browser) await browser.close();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 최종 서버 시작! 포트: ${PORT}`));