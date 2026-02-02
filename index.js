// [2026-02-02 최종 업데이트 버전] - 이 줄 때문에 무조건 깃이 인식함
import express from 'express';
import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

const app = express();

// 1. 메인 화면
app.get('/', (req, res) => {
    res.send(`
        <div style="text-align:center; padding:50px; font-family:sans-serif; background:#f0f2f5; height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center;">
            <div style="background:white; padding:40px; border-radius:15px; box-shadow:0 10px 25px rgba(0,0,0,0.1); width: 400px;">
                <h1 style="color:#00a495; margin-bottom:10px;">🌲 나무위키 레이스</h1>
                <p style="color:#666; margin-bottom:30px;">서버 배포 최적화 버전</p>
                <form action="/start" method="GET" style="display:flex; flex-direction:column; gap:10px;">
                    <input type="text" name="start" placeholder="🚩 출발 (예: 아이유)" required style="padding:15px; border:1px solid #ddd; border-radius:8px; font-size:16px;">
                    <input type="text" name="goal" placeholder="🏁 도착 (예: 대한민국)" required style="padding:15px; border:1px solid #ddd; border-radius:8px; font-size:16px;">
                    <button type="submit" style="padding:15px; background:#00a495; color:white; border:none; border-radius:8px; font-size:18px; cursor:pointer; font-weight:bold;">게임 시작</button>
                </form>
            </div>
        </div>
    `);
});

// 2. 게임 시작
app.get('/start', (req, res) => {
    const start = req.query.start;
    const goal = req.query.goal;
    res.redirect(`/game/${encodeURIComponent(start)}?goal=${encodeURIComponent(goal || '')}&count=0`);
});

// 3. 게임 오버
app.get('/gameover', (req, res) => {
    res.send(`
        <div style="text-align:center; padding-top:100px; font-family:sans-serif; background:#2c3e50; color:white; height:100vh;">
            <h1 style="font-size:80px; margin:0;">💀</h1>
            <h1>시간 초과!</h1>
            <a href="/" style="color:#00a495; background:white; padding:10px 20px; border-radius:30px; text-decoration:none; font-weight:bold;">다시 하기</a>
        </div>
    `);
});

// 4. 게임 로직 (모든 주소 처리)
app.get(/^\/game\/(.*)/, async (req, res) => {
    let keyword = req.params[0];
    if (keyword.includes('?')) keyword = keyword.split('?')[0];
    try { keyword = decodeURIComponent(keyword); } catch(e) {}

    const goal = req.query.goal || ""; 
    const count = parseInt(req.query.count) || 0;
    const targetUrl = `https://namu.wiki/w/${encodeURIComponent(keyword)}`;

    console.log(`🌲 이동: ${keyword} (목표: ${goal})`);

    // 승리 판정
    if (goal && keyword.replace(/_/g, ' ').trim() === goal.replace(/_/g, ' ').trim()) {
        return res.send(`
            <div style="text-align:center; padding-top:100px; font-family:sans-serif; background:#00a495; height:100vh; color:white;">
                <h1 style="font-size:100px; margin:0;">🎉</h1>
                <h1>축하합니다! 도착!</h1>
                <h2>도착지: ${goal}</h2>
                <h2 style="color:#ffeb3b; font-size:40px;">총 이동 횟수: ${count}번</h2>
                <a href="/" style="color:#2c3e50; background:white; padding:15px 30px; border-radius:30px; text-decoration:none; font-weight:bold;">다시 하기</a>
            </div>
        `);
    }

    try {
        const response = await gotScraping({
            url: targetUrl,
            headerGeneratorOptions: {
                browsers: [{ name: 'chrome', minVersion: 110 }],
                devices: ['desktop'],
                locales: ['ko-KR'],
                operatingSystems: ['windows'],
            }
        });

        const $ = cheerio.load(response.body);

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
                let realSrc = dataSrc.startsWith('/') ? `https://namu.wiki${dataSrc}` : dataSrc;
                $(el).attr('src', realSrc);
                $(el).removeAttr('data-src');
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
                $(el).attr('href', `/game/${nextKeyword}?goal=${encodeURIComponent(goal)}&count=${count + 1}`).css('cursor', 'pointer');
            } else {
                $(el).removeAttr('href').css('cursor', 'not-allowed').css('opacity', '0.5');
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
        res.send(`오류: ${e.message}`);
    }
});

// [핵심] 포트 설정 (이게 있어야 Render가 인식함)
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 업데이트 완료! 포트: ${PORT}`));