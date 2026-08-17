/*
 * VAULT — 돈 배분 엔진 (순수 로직, UI 의존성 없음)
 *
 * 재무 우선순위(Financial Order of Operations)를 BC 캐나다에 맞게 적용:
 *  1) 고정 필수비(렌트/식비) 먼저 확보
 *  2) 비상금 스타터 → 목표까지
 *  3) 고금리 빚 갚기 (이자 = 확정 수익)
 *  4) 남은 돈을 투자(TFSA/FHSA)·차 저축·For fun 으로 분배
 */

// 기본 버킷 정의 (라벨/색은 UI 공용)
const BUCKET_DEFS = [
  { key: "rent",      label: "렌트 / 주거", color: "#5eead4", essential: true },
  { key: "food",      label: "식비",        color: "#7dd3fc", essential: true },
  { key: "debt",      label: "빚 갚기",     color: "#fca5a5", essential: false },
  { key: "emergency", label: "비상금",      color: "#fcd34d", essential: false },
  { key: "invest",    label: "투자 · 주식", color: "#c4b5fd", essential: false },
  { key: "car",       label: "차 저축",     color: "#93c5fd", essential: false },
  { key: "fun",       label: "For fun",     color: "#f9a8d4", essential: false },
];

const BUCKET_MAP = Object.fromEntries(BUCKET_DEFS.map((b) => [b.key, b]));

/*
 * 사용자 상황에 맞춘 "똑똑한 추천 비율" 계산.
 * state: { hasHighInterestDebt, emergencyFunded, savingForHome }
 * 반환: { key: percent, ... }  합계 100
 */
function recommendPercents(state = {}) {
  const { hasHighInterestDebt = false, emergencyFunded = false, savingForHome = false } = state;

  // 필수비는 상황과 무관하게 대략 고정 (렌트 35 + 식비 15 = 50)
  let p = { rent: 35, food: 15, debt: 0, emergency: 0, invest: 0, car: 0, fun: 0 };
  let pool = 50; // 남은 재량 소득 50%

  if (hasHighInterestDebt) {
    // 빚부터 공격적으로 — 확정 수익
    p.debt = 22;
    p.emergency = emergencyFunded ? 3 : 10;
    p.invest = emergencyFunded ? 12 : 8;
    p.fun = 8;
    p.car = pool - (p.debt + p.emergency + p.invest + p.fun);
  } else if (!emergencyFunded) {
    // 빚 없음, 비상금 아직 안 참 → 비상금 우선
    p.emergency = 15;
    p.invest = savingForHome ? 15 : 20;
    p.car = 5;
    p.fun = 10;
    // 나머지는 투자로
    p.invest += pool - (p.emergency + p.invest + p.car + p.fun);
  } else {
    // 빚 없음 + 비상금 참 → 투자 극대화
    p.emergency = 2;   // 유지 보수
    p.invest = savingForHome ? 26 : 30;
    p.car = 8;
    p.fun = 10;
    p.invest += pool - (p.emergency + p.invest + p.car + p.fun);
  }

  // 반올림 오차 보정 → 합계 정확히 100
  return normalizePercents(p);
}

// 합계를 정확히 100으로 맞춤 (가장 큰 항목에서 오차 흡수)
function normalizePercents(p) {
  const keys = Object.keys(p);
  const rounded = {};
  let sum = 0;
  keys.forEach((k) => {
    rounded[k] = Math.round((p[k] || 0) * 10) / 10;
    sum += rounded[k];
  });
  const diff = Math.round((100 - sum) * 10) / 10;
  if (diff !== 0) {
    // 가장 값이 큰 버킷에 오차를 더함
    const biggest = keys.reduce((a, b) => (rounded[b] > rounded[a] ? b : a), keys[0]);
    rounded[biggest] = Math.round((rounded[biggest] + diff) * 10) / 10;
  }
  return rounded;
}

/*
 * 기본 버킷 배열 생성 (프로필에 저장할 형태)
 * percents 없으면 추천 비율 사용
 */
function makeBuckets(state, percents) {
  const pct = percents || recommendPercents(state);
  return BUCKET_DEFS.map((b) => ({
    key: b.key,
    label: b.label,
    color: b.color,
    percent: pct[b.key] ?? 0,
  }));
}

/*
 * 수입 금액을 버킷별로 분배
 * amount: number, buckets: [{key,label,color,percent}]
 * 반환: { rows: [{key,label,color,percent,amount}], total }
 * 반올림해서 마지막에 오차를 가장 큰 버킷에 흡수 → 합계 = amount
 */
function allocate(amount, buckets) {
  const amt = Number(amount) || 0;
  const rows = buckets.map((b) => ({
    key: b.key,
    label: b.label,
    color: b.color,
    percent: Number(b.percent) || 0,
    amount: Math.round(amt * (Number(b.percent) || 0)) / 100,
  }));
  // 센트 단위 오차 보정
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  const diff = Math.round((amt - sum) * 100) / 100;
  if (diff !== 0 && rows.length) {
    const biggest = rows.reduce((a, b) => (b.amount > a.amount ? b : a), rows[0]);
    biggest.amount = Math.round((biggest.amount + diff) * 100) / 100;
  }
  return { rows, total: amt };
}

// 합계 검증용
function sumPercents(buckets) {
  return Math.round(buckets.reduce((s, b) => s + (Number(b.percent) || 0), 0) * 10) / 10;
}

// 브라우저/모듈 양쪽 지원
if (typeof window !== "undefined") {
  window.VAULT_ALLOC = { BUCKET_DEFS, BUCKET_MAP, recommendPercents, normalizePercents, makeBuckets, allocate, sumPercents };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { BUCKET_DEFS, BUCKET_MAP, recommendPercents, normalizePercents, makeBuckets, allocate, sumPercents };
}
