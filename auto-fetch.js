#!/usr/bin/env node
/**
 * 큐 자동 보충 (국가 우선순위 + 실패 시 스킵)
 *  - data/city-ids/manifest.json 순서: 한국 → … → 호주 (중국 제외)
 *  - 수집 실패 시 cityId 스킵, 연속 N회 실패 시 다음 국가로 이동
 *  - 신규 도시 소진 시 publishedSlugs 맨 앞 글 순환 갱신
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  loadManifest, normalizeFetchState, markSkipped, pickNextFromRegistry,
  advanceRegionOnFailures, defaultFetchState,
} = require('./lib/city-registry');
const { loadCities } = require('./lib/cities');

const ROOT = __dirname;
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJSON = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');

function articleMeta(slug) {
  const p = path.join(ROOT, 'data', 'articles', slug + '.json');
  if (!fs.existsSync(p)) return null;
  const a = readJSON(p);
  return { cityId: a.cityId, slug, name: a.cityName || a.areaName || slug, country: '' };
}

function pickRefresh(cities, made, q) {
  if (process.env.ROTATE_WHEN_EXHAUSTED === '0') return null;
  const queue = q.queue || [];
  const published = q.publishedSlugs || [];
  const slug = published.find(s => made.has(s) && !queue.includes(s));
  if (!slug) return null;
  const city = cities.find(c => c.slug === slug) || articleMeta(slug);
  if (!city || !city.cityId) return null;
  return { city, mode: 'refresh' };
}

function saveFetchState(qPath, q, state) {
  q.fetchState = state;
  writeJSON(qPath, q);
}

function tryFetch(city, hotels) {
  execSync(`node fetch-hotels.js ${city.cityId} ${city.slug} ${hotels}`, { cwd: ROOT, stdio: 'inherit' });
  return fs.existsSync(path.join(ROOT, 'data', 'articles', city.slug + '.json'));
}

function enqueueSlug(qPath, slug) {
  const q2 = readJSON(qPath);
  q2.queue = q2.queue || [];
  const known = new Set([...(q2.queue || []), ...(q2.publishedSlugs || [])]);
  if (!known.has(slug)) q2.queue.push(slug);
  writeJSON(qPath, q2);
  return q2.queue.length;
}

function refill({ queueMin = Number(process.env.QUEUE_MIN || 4), hotels = Number(process.env.HOTELS || 7) } = {}) {
  const qPath = path.join(ROOT, 'data', 'queue.json');
  const q = readJSON(qPath);
  if ((q.queue || []).length >= queueMin) {
    console.log(`· 큐 충분(${(q.queue || []).length}≥${queueMin}) — 수집 생략`);
    return false;
  }

  const manifest = loadManifest();
  const maxAttempts = manifest.maxFetchAttemptsPerRun || 3;
  const state = normalizeFetchState(q, manifest);
  const made = new Set(
    fs.readdirSync(path.join(ROOT, 'data', 'articles'))
      .filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
  );
  const known = new Set([...(q.queue || []), ...(q.publishedSlugs || [])]);
  const cities = loadCities();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (readJSON(qPath).queue.length >= queueMin) return true;

    let next = pickNextFromRegistry(state, { made, known, manifest });
    if (!next) next = pickRefresh(cities, made, readJSON(qPath));
    if (!next) {
      console.log('· 수집할 도시 없음(전체 소진)');
      saveFetchState(qPath, readJSON(qPath), state);
      return false;
    }

    const { city, mode, region } = next;
    const label = mode === 'refresh' ? '↻ 재수집(갱신)' : `▶ [${region || '?'}] 수집`;
    console.log(`${label}: ${city.name} (${city.slug}, cityId=${city.cityId})`);

    try {
      if (!tryFetch(city, hotels)) throw new Error('article JSON 미생성');
      state.regionFails = 0;
      const n = enqueueSlug(qPath, city.slug);
      known.add(city.slug);
      made.add(city.slug);
      saveFetchState(qPath, readJSON(qPath), state);
      console.log(`✓ 큐 추가: ${city.slug} (큐 ${n}개)`);
      return true;
    } catch (e) {
      console.error(`✗ 스킵: ${city.slug} — ${e.message.split('\n')[0]}`);
      markSkipped(state, city.cityId);
      state.regionFails = (state.regionFails || 0) + 1;
      advanceRegionOnFailures(state, manifest);
      saveFetchState(qPath, readJSON(qPath), state);
    }
  }

  saveFetchState(qPath, readJSON(qPath), state);
  return false;
}

if (require.main === module) refill();
module.exports = { refill, pickRefresh };
