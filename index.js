// [2026-02-02 디버깅 모드] - HTML 원문 로그 출력 추가
import express from 'express';
import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

const app = express();

app.get('/', (req, res) => {
    res.send(`
        <div style="text-align:center; padding:50px;">
            <h1>🌲 디버깅 모드</h1>
            <form action="/start" method="GET">
                <input type="text" name="start" placeholder="출발" required>
                <input type="text" name="goal" placeholder="도착" required>
                <button type="submit">시작</button>
            </form>
        </div>
    `);
});

app.get('/start', (req, res) => {
    const start = req.query.start;
    const goal = req.query.goal;
    res.redirect(`/game/${encodeURIComponent(start)}?goal=${encodeURIComponent(goal || '')}&count=0`);
});

app.get(/^\/game\/(.*)/, async (req, res) => {
    let keyword = req.params[0];
    if (keyword.includes('?')) keyword = keyword.split('?')[0];
    try { keyword = decodeURIComponent(keyword); } catch(e) {}

    const goal = req.query.goal || ""; 
    const count = parseInt(req.query.count) || 0;
    const targetUrl = `https://namu.wiki/w/${encodeURIComponent(keyword)}`;

    console.log(`\n========================================`);
    console.log(`🌲 요청 시도: ${keyword}`);
    console.log(`🎯 타겟 URL: ${targetUrl}`);

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

        // [핵심 디버깅 로그] 서버가 받은 진짜 내용 까보기
        console.log(`📊 응답 상태 코드: ${response.statusCode}`); // 200이면 정상, 403이면 차단
        console.log(`📄 받아온 HTML 길이: ${response.body.length}`); 
        console.log(`📝 HTML 앞부분 500자 미리보기:\n${response.body.substring(0, 500)}`);
        console.log(`========================================\n`);

        const $ = cheerio.load(response.body);

        // 이미지, 스타일 처리
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
        });

        // 스크립트 제거 및 링크 변환
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

        res.send($.html());

    } catch (e) {
        console.error(`🚨 에러 발생: ${e.message}`);
        res.send(`에러 발생: ${e.message}`);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 디버깅 서버 시작! 포트: ${PORT}`));