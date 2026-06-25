#!/usr/bin/env node
/**
 * 자동발행 게이트 (GitHub Actions가 자주 호출)
 *  - schedule.json 간격에 따라 lastPostedAt + nextIntervalMin 경과 시 큐에서 1편을 publishedSlugs로 이동
 *  - 발행 여부와 무관하게 매 실행마다 build-all로 사이트 전체를 재생성(self-heal)
 *    → 데이터/템플릿이 바뀌면 모든 글·홈·사이트맵이 자동으로 최신화됨
 *  - 변경이 없으면 파일도 동일 → git diff 0 → 커밋 안 됨
 */
const fs = require('fs');
const path = require('path');
const { rebuildAll } = require('./build-all');

const ROOT = __dirname;
const P = {
  queue: path.join(ROOT, 'data', 'queue.json'),
  sched: path.join(ROOT, 'data', 'schedule.json'),
};
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const today = () => new Date().toISOString().slice(0, 10);
const save = q => fs.writeFileSync(P.queue, JSON.stringify(q, null, 2) + '\n');

function main() {
  const sched = readJSON(P.sched);
  const q = readJSON(P.queue);
  const intervals = sched.intervalsMin || [60, 58, 62, 59];
  const dailyMax = sched.dailyMax || 16;

  if (q.postedDate !== today()) { q.postedDate = today(); q.postedToday = 0; } // 자정 리셋

  const now = Date.now();
  const gate = q.lastPostedAt ? new Date(q.lastPostedAt).getTime() + (q.nextIntervalMin || intervals[0]) * 60000 : 0;
  const due = sched.active !== false && Array.isArray(q.queue) && q.queue.length > 0
    && (q.postedToday || 0) < dailyMax && now >= gate;

  if (due) {
    const slug = q.queue.shift();
    q.publishedSlugs = q.publishedSlugs || [];
    if (!q.publishedSlugs.includes(slug)) q.publishedSlugs.push(slug);
    q.lastPostedAt = new Date().toISOString();
    q.intervalCursor = ((q.intervalCursor || 0) + 1) % intervals.length;
    q.nextIntervalMin = intervals[q.intervalCursor];
    q.postedToday = (q.postedToday || 0) + 1;
    console.log(`✓ 발행: ${slug}  → 다음 ${q.nextIntervalMin}분 뒤  (오늘 ${q.postedToday}/${dailyMax}, 큐 ${q.queue.length}개 남음)`);
  } else {
    const reason = sched.active === false ? '비활성'
      : (!q.queue || !q.queue.length) ? '큐 비어있음'
      : (q.postedToday || 0) >= dailyMax ? `오늘 한도(${dailyMax}) 도달`
      : `아직 시간 안 됨 (${Math.ceil((gate - now) / 60000)}분 남음)`;
    console.log(`· 발행 안 함 (${reason}). 사이트 재생성만 수행.`);
  }

  save(q);
  // 발행한 경우에만 큐 보충(수집) — 발행+수집을 한 푸시로 묶어 Cloudflare 빌드 횟수 절약
  if (due) {
    try { require('./auto-fetch').refill(); } catch (e) { console.error('refill 오류: ' + e.message); }
  }
  rebuildAll(); // 항상 전체 재생성(self-heal)
}

main();
