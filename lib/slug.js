/** URL 슬러그 생성 (영문·숫자·하이픈) */
function slugify(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** "가드너스 베이 (Gardner's Bay)" → { ko, en } */
function parseCityLabel(label) {
  const raw = String(label || '').trim();
  if (!raw || /^NULL$/i.test(raw)) return { ko: '', en: '' };
  const m = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) return { ko: m[1].trim(), en: m[2].trim() };
  return { ko: raw, en: raw };
}

module.exports = { slugify, parseCityLabel };
