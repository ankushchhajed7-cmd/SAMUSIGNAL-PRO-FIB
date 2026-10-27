import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze, completedBars, fibLeg, pivots, TF_MS} from '../src/engine.js';
import {upBase, bars5, append5, dataFrom, nowAfter, agg, SPEC, CFG, M5} from './helpers.mjs';

const base = () => bars5(upBase());
const run = (b5, extra = {}, now) => analyze(dataFrom(b5), now || nowAfter(b5), SPEC, Object.assign({}, CFG, extra));
/* mirror: price ulta (downtrend) */
const flip = b5 => b5.map(b => ({t: b.t, o: 400 - b.o, h: 400 - b.l, l: 400 - b.h, c: 400 - b.c}));

test('incomplete (bann rahi) candle analysis se bahar', () => {
  const b = base(), now = b[b.length - 1].t + 2 * 60e3;           /* aakhri 5m candle abhi 2 min ki */
  const c = completedBars(b, '5min', now);
  assert.equal(c.length, b.length - 1);
  assert.ok(c.every(x => x.t + M5 <= now));
  const b15 = agg(b, 900e3), c15 = completedBars(b15, '15min', nowAfter(b));
  assert.ok(c15.every(x => x.t + TF_MS['15min'] <= nowAfter(b)));
});

test('pivot sirf k candle baad pakka (non-repainting)', () => {
  const b15 = agg(base(), 900e3).slice(0, -1);
  const P = pivots(b15, 3);
  assert.ok(P.every(p => p.i + 3 <= b15.length - 1));
  const lastH = P.filter(p => p.type === 'H').pop();
  const fewer = pivots(b15.slice(0, lastH.i + 3), 3);                  /* k-1 candle hi baad me */
  assert.ok(!fewer.some(p => p.type === 'H' && p.i === lastH.i), 'pivot k candle se pehle pakka nahi hona chahiye');
});

test('uptrend: Fib swing LOW -> HIGH, 61.8% neeche ki taraf', () => {
  const b15 = completedBars(agg(base(), 900e3), '15min', nowAfter(base()));
  const leg = fibLeg(b15, 'UP', Object.assign({}, CFG));
  assert.ok(leg && !leg.bad, JSON.stringify(leg));
  assert.ok(leg.end.px > leg.start.px);
  const exp = leg.end.px - 0.618 * (leg.end.px - leg.start.px);
  assert.ok(Math.abs(leg.lvl618 - exp) < 1e-9);
  assert.ok(leg.zone[0] < leg.lvl618 && leg.lvl618 < leg.zone[1]);
  assert.ok(leg.invalid < leg.zone[0]);
});

test('downtrend: Fib swing HIGH -> LOW, 61.8% upar ki taraf, sirf SELL', () => {
  const b5 = flip(base());
  const b15 = completedBars(agg(b5, 900e3), '15min', nowAfter(b5));
  const leg = fibLeg(b15, 'DOWN', Object.assign({}, CFG));
  assert.ok(leg && !leg.bad, JSON.stringify(leg));
  assert.ok(leg.end.px < leg.start.px);
  assert.ok(Math.abs(leg.lvl618 - (leg.end.px + 0.618 * (leg.start.px - leg.end.px))) < 1e-9);
  const r = run(b5);
  assert.equal(r.dir, 'SELL');
  assert.equal(r.trends.m15, 'DOWN');
});

test('base: trend + leg theek, price zone tak nahi = WAIT FOR FIB ZONE', () => {
  const r = run(base());
  assert.equal(r.trends.m15, 'UP');
  assert.equal(r.dir, 'BUY');
  assert.equal(r.state, 'WAIT FOR FIB ZONE', r.why.join(' | '));
});

/* zone ~[175.08, 176.04], 61.8% ~175.58, invalid ~173.57 */
const toZone = b => append5(b, [
  {o: 181.4, h: 181.5, l: 179.0, c: 179.2}, {o: 179.2, h: 179.3, l: 177.0, c: 177.2},
  {o: 177.2, h: 177.3, l: 175.9, c: 176.4}                                   /* wick zone me, close upar */
]);

test('sirf zone chhoona = signal nahi (WAIT FOR REJECTION)', () => {
  const r = run(toZone(base()));
  assert.equal(r.state, 'WAIT FOR REJECTION', r.why.join(' | '));
  assert.equal(r.entry, undefined);
});

test('BUY: band hui bullish rejection candle = CONFIRMED', () => {
  const b = append5(toZone(base()), [{o: 176.0, h: 176.9, l: 175.4, c: 176.8}]);
  const r = run(b);
  assert.equal(r.state, 'CONFIRMED', r.why.join(' | '));
  assert.equal(r.setup, 'PULLBACK');
  assert.equal(r.dir, 'BUY');
  assert.ok(r.sl < r.entry && r.tp > r.entry && r.rr >= 1.5);
});

test('bearish candle zone me = rejection nahi (BUY ke liye)', () => {
  const b = append5(toZone(base()), [{o: 176.4, h: 176.5, l: 175.4, c: 175.7}]);
  assert.equal(run(b).state, 'WAIT FOR REJECTION');
});

test('SELL: band hui bearish rejection candle = CONFIRMED (mirror)', () => {
  const b = flip(append5(toZone(base()), [{o: 176.0, h: 176.9, l: 175.4, c: 176.8}]));
  const r = run(b);
  assert.equal(r.state, 'CONFIRMED', r.why.join(' | '));
  assert.equal(r.dir, 'SELL');
  assert.ok(r.sl > r.entry && r.tp < r.entry);
});

test('bann rahi rejection candle se confirm nahi', () => {
  const b = append5(toZone(base()), [{o: 176.0, h: 176.9, l: 175.4, c: 176.8}]);
  const r = run(b, {}, b[b.length - 1].t + 3 * 60e3);                         /* aakhri candle abhi 3 min ki */
  assert.equal(r.state, 'WAIT FOR REJECTION');
});

test('rejection na mile to EXPIRED', () => {
  const b = append5(toZone(base()), Array.from({length: 7}, () => ({o: 176.4, h: 176.5, l: 176.1, c: 176.3})));
  assert.equal(run(b).state, 'EXPIRED');
});

test('invalidation ke paar 5m close = INVALIDATED', () => {
  const b = append5(toZone(base()), [{o: 176.4, h: 176.5, l: 173.0, c: 173.2}]);
  assert.equal(run(b).state, 'INVALIDATED');
});

test('STOP mode: sirf wick swing ke paar = breakout nahi', () => {
  const b = append5(base(), [{o: 181.4, h: 183.4, l: 181.3, c: 182.6}]);
  assert.notEqual(run(b).state, 'WAIT FOR BREAKOUT RETEST');
});

test('STOP mode: close paar = WAIT FOR BREAKOUT RETEST, retest + hold = CONFIRMED', () => {
  const b1 = append5(base(), [{o: 181.4, h: 183.8, l: 181.3, c: 183.6}]);
  assert.equal(run(b1).state, 'WAIT FOR BREAKOUT RETEST');
  const b2 = append5(b1, [{o: 183.6, h: 184.4, l: 183.5, c: 184.3}]);       /* door bhaaga, retest nahi */
  assert.equal(run(b2).state, 'WAIT FOR BREAKOUT RETEST');
  const b3 = append5(b2, [{o: 184.0, h: 184.1, l: 183.05, c: 184.0}]);     /* bearish candle = hold nahi */
  assert.equal(run(b3).state, 'WAIT FOR BREAKOUT RETEST');
  const b4 = append5(b3, [{o: 183.4, h: 183.9, l: 183.05, c: 183.8}]);     /* retest + upar band */
  const r = run(b4, {minRR: 1});
  assert.equal(r.setup, 'BREAKOUT');
  assert.ok(['CONFIRMED', 'NO SETUP'].includes(r.state));
});

test('1H aur 15m ulte = conflict NO TRADE', () => {
  const b = base(), d = dataFrom(b);
  d['1h'] = flip(b).length && agg(flip(b), 3600e3);                         /* 1H downtrend */
  const r = analyze(d, nowAfter(b), SPEC, CFG);
  assert.equal(r.state, 'NO SETUP');
  assert.match(r.why.join(' '), /conflict/);
});

test('spread / cost ke baad R:R kam = reject', () => {
  const b = append5(toZone(base()), [{o: 176.0, h: 176.9, l: 175.4, c: 176.8}]);
  const r = analyze(dataFrom(b), nowAfter(b), SPEC, CFG, {spreadPips: 250});
  assert.equal(r.state, 'NO SETUP');
  assert.ok(['rr', 'room'].includes(r.rejected));
});

test('paas me resistance = target chhota -> room / R:R reject', () => {
  const b = append5(toZone(base()), [{o: 176.0, h: 176.9, l: 175.4, c: 176.8}]);
  const r = run(b, {minRoomAtr: 50});
  assert.equal(r.state, 'NO SETUP');
  assert.equal(r.rejected, 'room');
});

test('CONFIRMED ke baad door nikal gaya = EXPIRED (chase nahi)', () => {
  const b = append5(toZone(base()), [{o: 176.0, h: 176.9, l: 175.4, c: 176.8}, {o: 176.8, h: 178.6, l: 176.7, c: 178.5}]);
  assert.equal(run(b).state, 'EXPIRED');
});

test('STALE data = signal band', () => {
  const b = base();
  const r = run(b, {}, nowAfter(b) + 60 * 60e3);
  assert.equal(r.stale, true);
  assert.equal(r.state, 'NO SETUP');
});

test('lookahead nahi: T ka faisla future candles jodne se nahi badalta', () => {
  const full = append5(toZone(base()), [{o: 176.0, h: 176.9, l: 175.4, c: 176.8},
    {o: 176.8, h: 177.0, l: 176.5, c: 176.9}, {o: 176.9, h: 178.0, l: 176.8, c: 177.9}]);
  for(let cut = full.length - 6; cut <= full.length; cut++){
    const part = full.slice(0, cut), T = nowAfter(part);
    const a = analyze(dataFrom(part), T, SPEC, CFG), b = analyze(dataFrom(full), T, SPEC, CFG);
    assert.deepEqual(b, a, 'cut ' + cut);
  }
});
