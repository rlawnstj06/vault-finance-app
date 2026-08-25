/* VAULT 배분 엔진 단위 테스트 — 실행: npm test  (또는 node --test) */
const test = require("node:test");
const assert = require("node:assert");
const A = require("../js/allocation.js");

const sumVals = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test("recommendPercents: 항상 합계 100", () => {
  for (const state of [{}, { hasHighInterestDebt: true }, { emergencyFunded: true }, { savingForHome: true }, { hasHighInterestDebt: true, savingForHome: true }]) {
    const sum = sumVals(A.recommendPercents(state));
    assert.ok(Math.abs(sum - 100) < 0.6, `state=${JSON.stringify(state)} sum=${sum}`);
  }
});

test("makeBuckets: 모든 버킷 반환 + 합계 ~100", () => {
  const b = A.makeBuckets({});
  assert.strictEqual(b.length, A.BUCKET_DEFS.length);
  b.forEach((x) => { assert.ok(x.key, "key 있음"); assert.strictEqual(typeof x.percent, "number"); });
  assert.ok(Math.abs(A.sumPercents(b) - 100) < 0.6);
});

test("allocate: 반올림 오차 없이 정확히 분배(합계=금액)", () => {
  const b = A.makeBuckets({});
  for (const amt of [1000, 2933, 137.55, 99999]) {
    const { rows, total } = A.allocate(amt, b);
    assert.strictEqual(total, amt);
    const s = Math.round(rows.reduce((a, r) => a + r.amount, 0) * 100) / 100;
    assert.strictEqual(s, amt, `amt=${amt} rows합=${s}`);
  }
});

test("allocate(0): 전부 0", () => {
  const { rows, total } = A.allocate(0, A.makeBuckets({}));
  assert.strictEqual(total, 0);
  assert.ok(rows.every((r) => r.amount === 0));
});

test("allocate: 커스텀 비율 정확히 반영", () => {
  const b = [{ key: "rent", label: "R", percent: 50 }, { key: "food", label: "F", percent: 50 }];
  const { rows } = A.allocate(100, b);
  const rent = rows.find((r) => r.key === "rent").amount;
  const food = rows.find((r) => r.key === "food").amount;
  assert.strictEqual(rent, 50);
  assert.strictEqual(food, 50);
});

test("normalizePercents: 100으로 보정", () => {
  const n = A.normalizePercents({ a: 33.33, b: 33.33, c: 33.33 });
  assert.ok(Math.abs(sumVals(n) - 100) < 0.001, `sum=${sumVals(n)}`);
});

test("sumPercents: 정상 합산", () => {
  assert.strictEqual(A.sumPercents([{ percent: 50 }, { percent: 30 }, { percent: 20 }]), 100);
  assert.strictEqual(A.sumPercents([{ percent: 50 }, { percent: 30 }]), 80);
});
