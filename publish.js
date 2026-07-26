#!/usr/bin/env node
/**
 * 자동발행 게이트 (GitHub Actions가 자주 호출)
 *  - schedule.json 간격에 따라 lastPostedAt + nextIntervalMin 경과 시 큐에서 1편 발행
 *  - 큐가 QUEUE_MIN 미만이면 auto-fetch로 신규 수집 또는 순환 갱신(도시 목록 소진 시)
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

  // 앵글 글 파생(저장된 풀 재활용) + 큐 추가. 이미 있으면 스킵이라 반복 안전(풀 없으면 no-op).
  try {
    const made = require('./gen-angles').genAngles({ limit: Number(process.env.ANGLE_MAX || 300) });
    if (made.length) {
      q.queue = q.queue || [];
      const known = new Set([...q.queue, ...(q.publishedSlugs || [])]);
      made.forEach(s => { if (!known.has(s)) { q.queue.push(s); known.add(s); } });
      console.log(`  ↳ 앵글 글 ${made.length}개 생성·큐 추가`);
    }
  } catch (e) { console.error('angle 오류: ' + e.message); }

  // 묶음 발행: due면 batch개까지 한 번에(1 push=1 build). batch 미설정 시 1개(기존 동작).
  const batch = Number(process.env.BATCH || sched.batch || 1);
  const now = Date.now();
  const gate = q.lastPostedAt ? new Date(q.lastPostedAt).getTime() + (q.nextIntervalMin || intervals[0]) * 60000 : 0;
  let posted = 0;
  while (sched.active !== false && Array.isArray(q.queue) && q.queue.length > 0
    && (q.postedToday || 0) < dailyMax && posted < batch && now >= gate) {
    const slug = q.queue.shift();
    q.publishedSlugs = q.publishedSlugs || [];
    if (q.publishedSlugs.includes(slug)) q.publishedSlugs = q.publishedSlugs.filter(s => s !== slug);
    q.publishedSlugs.push(slug);
    q.postedToday = (q.postedToday || 0) + 1;
    posted++;
  }
  if (posted) {
    q.lastPostedAt = new Date().toISOString();
    q.intervalCursor = ((q.intervalCursor || 0) + 1) % intervals.length;
    q.nextIntervalMin = intervals[q.intervalCursor];
    console.log(`✓ 발행 ${posted}편 (오늘 ${q.postedToday}/${dailyMax}, 큐 ${q.queue.length} 남음) → 다음 ${q.nextIntervalMin}분 뒤`);
  } else {
    console.log('· 발행 안 함 (시간/한도/큐 확인). 재생성만 수행.');
  }

  save(q);
  // 큐가 부족하면 수집(신규 도시 또는 순환 갱신) — 발행 여부와 무관하게 보충
  const queueMin = Number(process.env.QUEUE_MIN || 4);
  if ((q.queue || []).length < queueMin) {
    try { require('./auto-fetch').refill(); } catch (e) { console.error('refill 오류: ' + e.message); }
  }
  rebuildAll(); // 항상 전체 재생성(self-heal)
}

main();
