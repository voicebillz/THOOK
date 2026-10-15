import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreEpoch, splitPot } from "../src/scoring.js";

const T = "0xthook";
const X = "0xmeme";
const E18 = 10n ** 18n;
const w = (eth, thook, meme = 0n) => ({ eth: (eth * E18).toString(), tokens: { [T]: (thook * E18).toString(), ...(meme ? { [X]: (meme * E18).toString() } : {}) } });
const snap = (wallets, memePrice, ethUsd = 3000) => ({ ethUsd, prices: { [T]: 0.001, [X]: memePrice }, decimals: { [T]: 18, [X]: 18 }, wallets });

test("biggest held-all-week loss wins; gains offset", () => {
  const s0 = snap({ a: w(1n, 1000n, 100n), b: w(1n, 1000n, 10n) }, 10);
  const s1 = snap({ a: w(1n, 1000n, 100n), b: w(1n, 1000n, 10n) }, 2);
  const r = scoreEpoch([s0, s1], { minHold: 500n * E18, token: T });
  assert.equal(r[0].address, "a");
  assert.equal(Math.round(r[0].lossUsd), 800);
  assert.equal(Math.round(r[1].lossUsd), 80);
});

test("selling mid-week does not create a loss (min balance counts)", () => {
  const s0 = snap({ a: w(0n, 1000n, 100n) }, 10);
  const mid = snap({ a: w(0n, 1000n, 0n) }, 9);
  const s1 = snap({ a: w(0n, 1000n, 100n) }, 1);
  const r = scoreEpoch([s0, mid, s1], { minHold: 1n, token: T });
  assert.equal(r.length, 0);
});

test("must hold MIN_HOLD THOOK in every snapshot", () => {
  const s0 = snap({ a: w(0n, 1000n, 100n) }, 10);
  const mid = snap({ a: w(0n, 10n, 100n) }, 5);
  const s1 = snap({ a: w(0n, 1000n, 100n) }, 1);
  assert.equal(scoreEpoch([s0, mid, s1], { minHold: 500n * E18, token: T }).length, 0);
});

test("excluded addresses never rank", () => {
  const s0 = snap({ a: w(0n, 1000n, 100n) }, 10);
  const s1 = snap({ a: w(0n, 1000n, 100n) }, 1);
  assert.equal(scoreEpoch([s0, s1], { minHold: 1n, token: T, exclude: new Set(["a"]) }).length, 0);
});

test("splitPot sums exactly", () => {
  const pot = 1_000_000_000_000_000_001n;
  for (const n of [1, 2, 3, 5]) assert.equal(splitPot(pot, n).reduce((a, b) => a + b, 0n), pot);
  assert.deepEqual(splitPot(100n, 3), [50n, 25n, 25n]);
});
