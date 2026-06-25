#!/usr/bin/env node
/**
 * 큐 자동 보충 — 도시 목록(data/cities.json)에서 아직 안 만든 다음 도시를
 * 1개 수집해 큐에 추가한다. 발행 시점에 함께 호출돼 "푸시 1회"에 묶인다.
 *  - 아고다가 막히면(차단/오류) 조용히 false 반환(발행은 계속)
 *  - 큐가 충분하면(QUEUE_MIN 이상) 아무것도 안 함
 * 반환: 큐에 새 글을 추가했으면 true
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));

function refill({ queueMin = Number(process.env.QUEUE_MIN || 4), hotels = Number(process.env.HOTELS || 7) } = {}) {
  const cities = readJSON(path.join(ROOT, 'data', 'cities.json'));
  const q = readJSON(path.join(ROOT, 'data', 'queue.json'));
  if ((q.queue || []).length >= queueMin) { console.log(`· 큐 충분(${q.queue.length}≥${queueMin}) — 수집 생략`); return false; }

  const made = new Set(
    fs.readdirSync(path.join(ROOT, 'data', 'articles'))
      .filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
  );
  const next = cities.find(c => !made.has(c.slug));
  if (!next) { console.log('· 목록의 모든 도시 수집 완료'); return false; }

  console.log(`▶ 자동 수집: ${next.name} (${next.slug}, cityId=${next.cityId})`);
  try {
    execSync(`node fetch-hotels.js ${next.cityId} ${next.slug} ${hotels}`, { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    console.error('✗ 수집 실패(아고다 차단/오류 가능) — 발행은 계속: ' + e.message);
    return false;
  }
  if (!fs.existsSync(path.join(ROOT, 'data', 'articles', next.slug + '.json'))) return false;

  const q2 = readJSON(path.join(ROOT, 'data', 'queue.json'));
  q2.queue = q2.queue || [];
  const known = new Set([...(q2.queue || []), ...(q2.publishedSlugs || [])]);
  if (!known.has(next.slug)) q2.queue.push(next.slug);
  fs.writeFileSync(path.join(ROOT, 'data', 'queue.json'), JSON.stringify(q2, null, 2) + '\n');
  console.log(`✓ 큐 추가: ${next.slug} (큐 ${q2.queue.length}개)`);
  return true;
}

if (require.main === module) refill();
module.exports = { refill };
