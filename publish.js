#!/usr/bin/env node
/**
 * 자동발행 게이트 (GitHub Actions가 자주 호출)
 *  - data/schedule.json 의 간격(28·29·30·31분) 정책에 따라
 *    lastPostedAt + nextIntervalMin 이 지났을 때만 큐에서 1편 발행
 *  - 발행 = 글 HTML 빌드 + index 카드 주입 + sitemap 갱신 + 큐/상태 기록
 *  - CI에서 아고다 호출 없음(이미 수집된 JSON만 사용) → 안정적·$0
 *  - 변경이 없으면 파일도 동일 → git diff 0 → 커밋 안 됨
 */
const fs = require('fs');
const path = require('path');
const { buildOne } = require('./build');

const ROOT = __dirname;
const SITE = 'https://howcartful.com';
const P = {
  queue: path.join(ROOT, 'data', 'queue.json'),
  sched: path.join(ROOT, 'data', 'schedule.json'),
  index: path.join(ROOT, 'index.html'),
  sitemap: path.join(ROOT, 'sitemap.xml'),
};
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const today = () => new Date().toISOString().slice(0, 10);

function articleMeta(slug) {
  const d = readJSON(path.join(ROOT, 'data', 'articles', slug + '.json'));
  return { slug, title: d.title || slug, desc: d.metaDescription || '' };
}
function renderCards(slugs) {
  if (!slugs.length) return '<div class="card">\n        <h2>준비 중</h2>\n        <p>첫 비교 글이 곧 발행됩니다.</p>\n      </div>';
  return slugs.map(s => {
    const m = articleMeta(s);
    return `<a class="card" href="/articles/${s}">\n        <h2>${esc(m.title)}</h2>\n        <p>${esc(m.desc)}</p>\n      </a>`;
  }).join('\n      ');
}
function updateIndex(publishedSlugs) {
  const cards = renderCards([...publishedSlugs].reverse()); // 최신글 위로
  let html = fs.readFileSync(P.index, 'utf8');
  html = html.replace(/<!--ARTICLES_START-->[\s\S]*?<!--ARTICLES_END-->/,
    `<!--ARTICLES_START-->\n      ${cards}\n      <!--ARTICLES_END-->`);
  fs.writeFileSync(P.index, html);
}
function updateSitemap(publishedSlugs) {
  const now = today();
  const urls = [`${SITE}/`, ...publishedSlugs.map(s => `${SITE}/articles/${s}`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${u}</loc><lastmod>${now}</lastmod></url>`).join('\n') +
    `\n</urlset>\n`;
  fs.writeFileSync(P.sitemap, xml);
}

function save(q) { fs.writeFileSync(P.queue, JSON.stringify(q, null, 2) + '\n'); }

function main() {
  const sched = readJSON(P.sched);
  const q = readJSON(P.queue);
  const intervals = sched.intervalsMin || [30, 29, 31, 28];
  const dailyMax = sched.dailyMax || 10;

  if (q.postedDate !== today()) { q.postedDate = today(); q.postedToday = 0; } // 자정 리셋

  if (sched.active === false) { console.log('· 비활성(schedule.active=false)'); return save(q); }
  if (!q.queue || !q.queue.length) { console.log('· 큐 비어있음 — 발행할 글 없음'); return save(q); }
  if ((q.postedToday || 0) >= dailyMax) { console.log(`· 오늘 발행 한도(${dailyMax}) 도달`); return save(q); }

  const now = Date.now();
  const gate = q.lastPostedAt ? new Date(q.lastPostedAt).getTime() + (q.nextIntervalMin || intervals[0]) * 60000 : 0;
  if (now < gate) { console.log(`· 아직 시간 안 됨 (${Math.ceil((gate - now) / 60000)}분 남음)`); return save(q); }

  // ── 발행 ──
  const slug = q.queue.shift();
  buildOne(slug);
  q.publishedSlugs = q.publishedSlugs || [];
  if (!q.publishedSlugs.includes(slug)) q.publishedSlugs.push(slug);
  q.lastPostedAt = new Date().toISOString();
  q.intervalCursor = ((q.intervalCursor || 0) + 1) % intervals.length;
  q.nextIntervalMin = intervals[q.intervalCursor];
  q.postedToday = (q.postedToday || 0) + 1;

  updateIndex(q.publishedSlugs);
  updateSitemap(q.publishedSlugs);
  save(q);
  console.log(`✓ 발행: ${slug}  → 다음 ${q.nextIntervalMin}분 뒤  (오늘 ${q.postedToday}/${dailyMax}, 큐 ${q.queue.length}개 남음)`);
}

main();
