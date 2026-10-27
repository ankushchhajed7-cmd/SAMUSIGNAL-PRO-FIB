import test from 'node:test';
import assert from 'node:assert/strict';
import {mtfGate, fibPlan} from '../src/mtf.js';
import {completedBars} from '../src/engine.js';
import {upBase, bars5, agg, nowAfter} from './helpers.mjs';

const rd = (t, adx = 25) => ({t, adx, hi: 1, lo: 0.99, atr: 0.001});
test('gate: naya trend (15m trend + 1H flat) = order', () => {
  assert.equal(mtfGate({'1h': rd('FLAT'), '15min': rd('UP')}, 0.003).mode, 'UP');
  assert.equal(mtfGate({'1h': rd('FLAT'), '15min': rd('DOWN')}, 0.003).mode, 'DOWN');
});
test('gate: purana / rest / ulte = NO TRADE', () => {
  assert.equal(mtfGate({'1h': rd('UP'), '15min': rd('UP')}, 0.003).cat, 'purana');
  assert.equal(mtfGate({'1h': rd('DOWN'), '15min': rd('FLAT')}, 0.003).cat, 'rest');
  assert.equal(mtfGate({'1h': rd('UP'), '15min': rd('DOWN')}, 0.003).mode, 'NONE');
});

const b = bars5(upBase()), b15 = completedBars(agg(b, 900e3), '15min', nowAfter(b));
const ctx = live => ({live, a5: 0.2, a15: 0.8, pip: 0.01, gap: 5, spread: 0.02});
test('BUY: LIMIT = 61.8% live ke NEECHE, STOP = swing high ke UPAR', () => {
  const p = fibPlan({mode: 'UP', cat: 'naya', why: 'x'}, b15, ctx(181.4));
  const L = p.legs.find(x => x.kind === 'LIMIT'), S = p.legs.find(x => x.kind === 'STOP');
  assert.ok(p.leg && Math.abs(L.entry - p.leg.lvl618) < 1e-9);
  assert.ok(L.entry < 181.4 && L.ok, JSON.stringify(L));
  assert.ok(S.entry > p.leg.end.px && S.ok, JSON.stringify(S));
  assert.equal(L.dir, 'BUY'); assert.equal(S.dir, 'BUY');
});
test('live pehle hi 61.8% ke paar = LIMIT nahi', () => {
  const p = fibPlan({mode: 'UP', cat: 'naya', why: 'x'}, b15, ctx(175.0));
  assert.equal(p.legs.find(x => x.kind === 'LIMIT').ok, false);
});
test('bahut door = order nahi (doori ki shart)', () => {
  const p = fibPlan({mode: 'UP', cat: 'naya', why: 'x'}, b15, {live: 181.4, a5: 0.2, a15: 0.5, pip: 0.01, gap: 1, spread: 0.02});
  assert.ok(p.legs.every(L => !L.ok));
  assert.equal(p.mode, 'NONE');
});
test('NO TRADE gate pe koi order nahi; RANGE pe bhi nahi', () => {
  assert.equal(fibPlan({mode: 'NONE', why: 'x'}, b15, ctx(181.4)).legs.length, 0);
  assert.equal(fibPlan({mode: 'RANGE', why: 'x'}, b15, ctx(181.4)).mode, 'NONE');
});
