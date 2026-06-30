#!/usr/bin/env node
/**
 * 전체 재생성기 — 데이터/템플릿이 바뀌어도 사이트 전체를 한 번에 최신화.
 *  - data/articles/*.json 전부 → articles/*.html (현재 템플릿으로 재빌드)
 *  - 홈(index.html) 글 목록 → queue.json publishedSlugs 기준으로 갱신(최신글 위로)
 *  - sitemap.xml → publishedSlugs 기준 갱신
 * 사용: node build-all.js
 */
const fs = require('fs');
const path = require('path');
const { buildOne } = require('./build');
const titles = require('./lib/titles');

const ROOT = __dirname;
const SITE = 'https://howcartful.com';
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const today = () => new Date().toISOString().slice(0, 10);
const imgUrl = u => u ? ('https:' + String(u).replace(/^https?:/, '')) : '';

function rebuildAll() {
  const q = readJSON(path.join(ROOT, 'data', 'queue.json'));
  const published = Array.isArray(q.publishedSlugs) ? q.publishedSlugs : [];

  // 1) 모든 글 HTML 재빌드 (현재 템플릿·데이터 반영)
  const slugs = fs.readdirSync(path.join(ROOT, 'data', 'articles'))
    .filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
  slugs.forEach(buildOne);

  // 2) 홈 글 목록 = 발행된 글만, 최신글 위로
  const meta = slug => {
    const d = readJSON(path.join(ROOT, 'data', 'articles', slug + '.json'));
    const thumbs = (d.hotels || []).map(h => h.img).filter(Boolean).slice(0, 4).map(imgUrl);
    return { title: titles.makeTitle(d), desc: titles.makeCardDesc(d), thumbs };
  };
  // 호스트별 썸네일 축소(용량↓). 실패 시 onerror로 원본 폴백(깨짐 방지).
  const smallImg = u => {
    if (/bstatic\.com/.test(u)) return u.replace(/\/max\d+(x\d+)?\//, '/max300/').replace(/\/square\d+\//, '/square180/');
    if (/pix\d*\.agoda\.net/.test(u)) return u + (u.includes('?') ? '&' : '?') + 's=360x240';
    return u;
  };
  // 보라 패널 안에 4장 동일 크기 그리드(Codex 카드 스타일)
  const thumbHtml = thumbs => {
    if (!thumbs.length) return '';
    const imgs = thumbs.slice(0, 4).map(u => {
      const s = smallImg(u);
      const fb = s !== u ? ` onerror="this.onerror=null;this.src='${u}'"` : '';
      return `<img src="${s}"${fb} alt="" loading="lazy" decoding="async">`;
    }).join('');
    return `<div class="cpanel"><div class="cgrid">${imgs}</div></div>`;
  };
  const cards = list => {
    if (!list.length) return '<div class="card">\n        <div class="cbody"><h2>준비 중</h2><p>첫 비교 글이 곧 발행됩니다.</p></div>\n      </div>';
    return list.map(s => {
      const m = meta(s);
      return `<a class="card" href="/articles/${s}">\n        ${thumbHtml(m.thumbs)}\n        <div class="cbody"><h2>${esc(m.title)}</h2><p>${esc(m.desc)}</p></div>\n        <span class="cbtn">리뷰 보러가기 →</span>\n      </a>`;
    }).join('\n      ');
  };
  const onIndex = published.filter(s => slugs.includes(s));
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/<!--ARTICLES_START-->[\s\S]*?<!--ARTICLES_END-->/,
    `<!--ARTICLES_START-->\n      ${cards([...onIndex].reverse())}\n      <!--ARTICLES_END-->`);
  fs.writeFileSync(path.join(ROOT, 'index.html'), html);

  // 3) 사이트맵
  const urls = [`${SITE}/`, ...onIndex.map(s => `${SITE}/articles/${s}`)];
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${u}</loc><lastmod>${today()}</lastmod></url>`).join('\n') +
    `\n</urlset>\n`);

  console.log(`✓ 전체 재생성: 글 ${slugs.length}편 빌드, 홈 카드 ${onIndex.length}개, 사이트맵 ${urls.length}개`);
  return { built: slugs.length, cards: onIndex.length };
}

if (require.main === module) rebuildAll();
module.exports = { rebuildAll };
