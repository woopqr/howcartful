/**
 * 블로거(20대 인플루언서) 말투 인트로 — 글마다 다르게(슬러그 고정 랜덤)
 *  - 사실은 실데이터(평점·도보·가격)만 사용, 말투만 입힘(과장·허위 금지)
 *  - 정적 사이트라 접속 시 랜덤이 아니라 "글별 고정" 랜덤(SEO 안전)
 */
const { cityInfo } = require('./titles');

function hash(s) { let h = 2166136261; for (let i = 0; i < String(s).length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const shortName = s => String(s || '').split('(')[0].trim();

const OPEN = [
  a => `안녕하세요 여러분! 😊 오늘 콕 집어 소개할 곳은 바로 <b>${a.city}</b> 숙소들이에요~ 1등부터 살짝 스포하면 <b>${a.hotel}</b>, 평점이 무려 <b>${a.score}</b>점이라구요!`,
  a => `자, 오늘의 주인공 등장이요! 🎬 <b>${a.city}</b>에서 제가 진짜 강추하는 <b>${a.hotel}</b>… 역에서 도보 <b>${a.walk}분</b>이면 거의 역세권 아니겠어요?`,
  a => `여러분 요즘 <b>${a.city}</b> 숙소값 장난 아니죠? 🥲 그래서 제가 발품(?) 팔아서 가성비만 쏙 골라왔어요. 오늘의 톱은 <b>${a.hotel}</b>${a.price ? ` — 1박 <b>${a.price}</b>` : ''}!`,
  a => `오늘도 정보 하나 물어왔습니다 🫶 <b>${a.city}</b> 가는 분들 주목! 리뷰 <b>${a.count}</b>개나 쌓인 <b>${a.hotel}</b>부터 보고 갈게요~`,
  a => `제가 진짜 좋아하는 여행 준비 시간… 🧳 오늘은 <b>${a.city}</b> 편이에요! 평점 <b>${a.score}</b>에 위치까지 좋은 <b>${a.hotel}</b>, 같이 구경 가실래요?`,
  a => `솔직히 말할게요, <b>${a.city}</b> 숙소 이 정도면 '찜' 각이에요 😳 특히 <b>${a.hotel}</b>… 도보 <b>${a.walk}분</b>에 이 평점이면 반칙 아닌가요?`,
  a => `여러분 안녕하세요! 오늘의 <b>${a.city}</b> 가성비 숙소 모음.zip 🗂️ 준비했어요. 스크롤 내리기 전에 <b>${a.hotel}</b>부터 눈도장 쾅!`,
  a => `기다리셨죠? 🙌 <b>${a.city}</b> 숙소 리스트 나갑니다. 오늘의 원픽은 <b>${a.hotel}</b>${a.price ? `, 1박 <b>${a.price}</b>` : ''}인데 이유는 아래에서 알려드릴게요~`,
  a => `제 여행 계정 오래 보신 분들은 아시죠, 저 가성비 진심인 거 😎 <b>${a.city}</b>에서도 제대로 골라왔어요. 시작은 <b>${a.hotel}</b>!`,
  a => `오늘 소개하는 <b>${a.city}</b> 숙소들, 하나하나 리뷰 다 뜯어봤어요 🔍 그중 <b>${a.hotel}</b>는 평점 <b>${a.score}</b>… 믿고 보셔도 돼요!`,
  a => `자자 집중~ ✋ <b>${a.city}</b> 여행 계획 중이라면 이 글 저장 필수예요. 톱은 <b>${a.hotel}</b>, 도보 <b>${a.walk}분</b> 초역세권이라구요!`,
  a => `요즘 제 DM에 <b>${a.city}</b> 숙소 추천 요청이 많아서요 💌 아예 정리해왔어요! 1등 <b>${a.hotel}</b>부터 천천히 보여드릴게요.`,
  a => `띵동! 🛎️ 오늘의 <b>${a.city}</b> 숙소 배달 왔습니다. 개인적으로 <b>${a.hotel}</b>가 제일 끌렸는데… 평점 <b>${a.score}</b> 실화인가요?`,
  a => `여행 준비의 90%는 숙소죠 💯 <b>${a.city}</b> 가시는 분들 위해 리뷰 좋은 곳만 추렸어요. 대망의 1등, <b>${a.hotel}</b>!`,
];

const CLOSE = [
  '아래에서 하나씩 자세히 비교해볼게요, 끝까지 봐요 우리 🫶',
  '그럼 지금부터 순위대로 쭉 보여드릴게요!',
  '자세한 평점·가격·거리는 바로 아래 표에서 확인하세요 👇',
  '어디가 내 취향일지, 같이 골라봐요!',
  '스크롤 조금만 내리면 전체 순위 나와요~',
];

function intro(article) {
  const top = article.hotels && article.hotels[0];
  if (!top) return '';
  const { city } = cityInfo(article);
  const price = ((top.priceText || '').split('·')[1] || '').trim();
  const ctx = {
    city, hotel: shortName(top.name), score: top.score,
    walk: top.walkMin, price, count: Number(top.reviewCount || 0).toLocaleString('en-US'),
    n: (article.hotels.length) || 7,
  };
  const h = hash(article.slug);
  const open = OPEN[h % OPEN.length](ctx);
  const close = CLOSE[(h >>> 5) % CLOSE.length];
  return `${open} ${close}`;
}

module.exports = { intro };
