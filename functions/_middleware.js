/**
 * 내부 파일 공개 차단 (Cloudflare Pages Functions)
 *  - Pages가 저장소 루트를 그대로 배포하므로 발행 스크립트·큐·수집 로직·워크플로까지 URL로 열람 가능했음
 *  - _routes.json 의 include 경로에서만 이 함수가 실행됨(일반 페이지는 정적 서빙, 함수 호출량 0)
 *  - 아래 목록에 걸리면 404, 아니면 정상 통과 → _routes.json 을 넓게 잡아도 사이트가 깨지지 않음
 *  - 새 내부 파일/폴더를 루트에 추가하면 여기 + _routes.json 양쪽에 등록할 것
 */
const BLOCK_PREFIX = ['/data/', '/lib/', '/scripts/', '/templates/', '/functions/', '/.github/', '/.git/', '/node_modules/', '/_backup/'];
const BLOCK_EXACT = new Set(['/data', '/lib', '/scripts', '/templates', '/functions', '/.github', '/.git', '/_backup', '/_routes.json']);
const BLOCK_EXT = /\.(js|mjs|cjs|md|txt|yml|yaml|env|pem|key|log|docx|hwp|hwpx|xlsx|xls|sh|py|bak)$/i;
const BLOCK_DOTFILE = /\/\.[^/]+$/; // .gitignore, .env, .DS_Store …
const ALLOW = new Set(['/robots.txt', '/ads.txt']);

export async function onRequest(context) {
  const p = decodeURIComponent(new URL(context.request.url).pathname);
  if (!ALLOW.has(p) && (BLOCK_EXACT.has(p) || BLOCK_PREFIX.some(x => p.startsWith(x)) || BLOCK_EXT.test(p) || BLOCK_DOTFILE.test(p))) {
    return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
  }
  return context.next();
}
