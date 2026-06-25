#!/usr/bin/env node
/**
 * 큐 자동 보충기 — 큐가 줄면 도시 목록(data/cities.json)에서
 * 아직 안 만든 다음 도시를 자동 수집해 큐에 추가한다.
 *  - GitHub Actions가 주기적으로 호출 → 사람 개입 0
 *  - 아고다가 막히면(차단/오류) 조용히 종료(워크플로는 계속 진행)
 *  - 큐가 충분하면(QUEUE_MIN 이상) 아무것도 안 함
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const QUEUE_MIN = Number(process.env.QUEUE_MIN || 5);
const HOTELS = Number(process.env.HOTELS || 7);
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));

const cities = readJSON(path.join(ROOT, 'data', 'cities.json'));
const q = readJSON(path.join(ROOT, 'data', 'queue.json'));

if ((q.queue || []).length >= QUEUE_MIN) {
  console.log(`· 큐 충분(${q.queue.length} ≥ ${QUEUE_MIN}) — 수집 생략`);
  process.exit(0);
}

const made = new Set(
  fs.readdirSync(path.join(ROOT, 'data', 'articles'))
    .filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
);
const next = cities.find(c => !made.has(c.slug));
if (!next) { console.log('· 목록의 모든 도시 수집 완료'); process.exit(0); }

console.log(`▶ 자동 수집: ${next.name} (${next.slug}, cityId=${next.cityId})`);
try {
  execSync(`node fetch-hotels.js ${next.cityId} ${next.slug} ${HOTELS}`, { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  console.error('✗ 수집 실패(아고다 차단/오류 가능). 워크플로는 계속 진행: ' + e.message);
  process.exit(0); // 실패해도 워크플로 중단하지 않음
}

// 수집 성공 → 큐에 추가
if (!fs.existsSync(path.join(ROOT, 'data', 'articles', next.slug + '.json'))) {
  console.error('✗ 글 JSON 미생성 — 큐 추가 생략');
  process.exit(0);
}
const q2 = readJSON(path.join(ROOT, 'data', 'queue.json'));
q2.queue = q2.queue || [];
const known = new Set([...(q2.queue || []), ...(q2.publishedSlugs || [])]);
if (!known.has(next.slug)) q2.queue.push(next.slug);
fs.writeFileSync(path.join(ROOT, 'data', 'queue.json'), JSON.stringify(q2, null, 2) + '\n');
console.log(`✓ 큐 추가: ${next.slug} (큐 ${q2.queue.length}개)`);
