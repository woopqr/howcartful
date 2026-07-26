/**
 * 가격 적정성 · "예약 적기" 판정 + 12개월 차트
 *  입력: months = 길이 12 배열(월별 대표가 KRW, 없으면 0/null), curIdx = 현재월(0~11)
 *  원칙(사장님 요청): 부정 정보로 불쾌감 주지 않기.
 *   - 싼 시기 → 지금 예약 유도
 *   - 보통 → 더 싼 달을 부드럽게 안내
 *   - 비쌈 → "안 싸다"가 아니라 "연중 최고가(성수기) 대비 얼마나 저렴한지"로 위안 + 유연하면 싼 달 제안
 */
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
const won = n => (n >= 10000 ? `${Math.round(n / 10000)}만원` : `${Math.round(n / 1000) * 1000}원`);
const pct = (a, b) => Math.max(0, Math.round((1 - a / b) * 100)); // b 대비 a가 몇 % 저렴

function analyze(months, curIdx) {
  const valid = months.map((v, i) => ({ v: Number(v) || 0, i })).filter(x => x.v > 0);
  if (valid.length < 3) return null;
  const cur = Number(months[curIdx]) || 0;
  if (!cur) return null;
  const sortedAsc = valid.slice().sort((a, b) => a.v - b.v);
  const cheapest = sortedAsc[0], priciest = sortedAsc[sortedAsc.length - 1];
  const mid = sortedAsc[Math.floor(sortedAsc.length / 2)].v;
  const rankAsc = valid.filter(x => x.v < cur).length + 1;   // 1 = 가장 쌈
  const level = rankAsc <= 3 ? 'cheap' : (rankAsc >= valid.length - 2 || cur / mid >= 1.2) ? 'expensive' : 'normal';

  let badge, msg;
  const cheaperBy = pct(cheapest.v, cur);          // 최저월이 현재보다 몇 % 쌈
  const belowPeak = pct(cur, priciest.v);          // 현재가 최고월보다 몇 % 쌈
  if (level === 'cheap') {
    badge = `연중 ${rankAsc}번째로 싼 시기`;
    msg = `🟢 <b>지금이 예약 적기예요.</b> 연중 <b>${rankAsc}번째로 저렴</b>한 달이라, 미루면 오히려 오를 수 있어요. 계획이 있다면 지금 잡는 게 유리합니다.`;
  } else if (level === 'normal') {
    badge = `적정 가격대`;
    msg = cheaperBy >= 5
      ? `🟡 <b>무난한 가격대</b>예요. 날짜가 유연하다면 <b>${MONTHS[cheapest.i]}</b>이 약 <b>${cheaperBy}%</b> 더 저렴합니다 — 급하지 않다면 참고하세요.`
      : `🟡 <b>연중 평균과 비슷한 가격</b>이에요. 지금 예약해도 손해 보는 시기는 아닙니다.`;
  } else {
    badge = `성수기(높은 편)`;
    // 비싸다는 사실보다 긍정 프레임 — 그 달에 꼭 가야 하는 사람 배려
    if (priciest.i === curIdx || belowPeak < 2) {
      msg = `🔴 <b>연중 여행 수요가 가장 몰리는 성수기</b>예요. 그만큼 인기 숙소는 빨리 마감되니, 마음에 드는 곳이 있다면 서둘러 예약하는 게 좋아요.`;
    } else {
      msg = `🔴 성수기라 가격이 높은 편이지만, <b>연중 가장 비싼 ${MONTHS[priciest.i]}보다 약 ${belowPeak}% 저렴</b>해요. 이 시기 여행이라면 무리한 가격은 아닙니다.`;
    }
    if (cheaperBy >= 10) msg += ` 혹시 날짜가 유동적이라면 <b>${MONTHS[cheapest.i]}</b>이 약 <b>${cheaperBy}%</b> 더 쌉니다.`;
  }
  return { level, rankAsc, badge, msg, curPrice: cur, cheapest, priciest, count: valid.length };
}

// 12개월 막대 차트(인라인 SVG, $0). 성수기 빨강 / 비수기 파랑 / 보통 회색, 현재월 강조.
function chartSVG(months, curIdx) {
  const vals = months.map(v => Number(v) || 0);
  const nz = vals.filter(v => v > 0);
  if (nz.length < 3) return '';
  const max = Math.max(...nz), min = Math.min(...nz), mid = nz.slice().sort((a, b) => a - b)[Math.floor(nz.length / 2)];
  const W = 360, H = 150, padB = 26, padT = 18, bw = (W - 12) / 12, maxH = H - padB - padT;
  let bars = '';
  vals.forEach((v, i) => {
    const x = 6 + i * bw;
    if (!v) { return; }
    const h = Math.max(6, Math.round(((v - min) / (max - min || 1) * 0.8 + 0.2) * maxH));
    const y = H - padB - h;
    const color = v >= mid * 1.08 ? '#f04747' : v <= mid * 0.94 ? '#4f8ef7' : '#b7bece';
    const cur = i === curIdx;
    bars += `<rect x="${(x + 2).toFixed(1)}" y="${y}" width="${(bw - 4).toFixed(1)}" height="${h}" rx="3" fill="${color}"${cur ? ' stroke="#7c3aed" stroke-width="2"' : ''}/>`;
    if (cur) bars += `<text x="${(x + bw / 2).toFixed(1)}" y="${y - 5}" text-anchor="middle" font-size="9" font-weight="700" fill="#7c3aed">지금</text>`;
    bars += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 9}" text-anchor="middle" font-size="8.5" fill="#8a93a3">${i + 1}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="pchart" role="img" aria-label="12개월 가격 추이">`
    + `<line x1="4" y1="${H - padB}" x2="${W - 4}" y2="${H - padB}" stroke="#e6e8ef" stroke-width="1"/>${bars}</svg>`;
}

// 글 최상단에 넣을 "예약 적기" 카드 전체 HTML
function priceCard(cityName, months, curIdx) {
  const a = analyze(months, curIdx);
  if (!a) return '';
  const chart = chartSVG(months, curIdx);
  const lvlClass = a.level;
  return `<div class="pricecard ${lvlClass}">`
    + `<div class="pctop"><span class="pcbadge">📅 ${a.badge}</span>`
    + `<span class="pcnow">현재(${MONTHS[curIdx]}) 1박 중앙값 ${won(a.curPrice)}</span></div>`
    + `<p class="pcmsg">${a.msg}</p>`
    + `<div class="pcchartwrap">${chart}<div class="pclegend"><span><i class="pk"></i>성수기</span><span><i class="vl"></i>비수기</span><span><i class="md"></i>보통</span></div></div>`
    + `<p class="pcnote">아고다 미래 12개월 체크인 조회 기준 · 실시간 가격은 예약창에서 확인하세요.</p>`
    + `</div>`;
}

module.exports = { analyze, chartSVG, priceCard, MONTHS };
