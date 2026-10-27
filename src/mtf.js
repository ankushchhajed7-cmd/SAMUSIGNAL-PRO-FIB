/* 📈 Chart Analysis — SamuSignal v10.6.6 ka faisla (naya trend) + Fib 61.8% se order ka bhaav
   ---------------------------------------------------------------------------------
   Disha / NO TRADE: SamuSignal ke mtfRead + mtfGate (bilkul wahi niyam, yahan copy):
     15m UP/DOWN + 1H FLAT = "naya trend" -> order · 15m + 1H dono saath = "purana" -> NO TRADE ·
     15m FLAT = "rest" -> NO TRADE · 15m / 1H ulte = NO TRADE · dono flat = range (yahan NO TRADE —
     Fib sirf trend me, backtest bhi sirf trend ka hua).
   Bhaav: 15m ka pakka Fib leg (engine.fibLeg) ->
     LIMIT = 61.8% (trend ki disha me pullback) · STOP = swing ke paar + (0.35 x 5m ATR + spread).
   Doori ki shart SamuSignal jaisi: live se kam se kam max(0.2 x ATR5, 3 pip), zyada se zyada
   max(2 x ATR15, $5 grid gap ki doori). Backtest (12 pair, 22 din): Level Engine se thoda kam DD,
   ~1/3 trade — saabit fayda nahi, demo pe parkho. AI (Gemini) nahi. */
import {fibLeg, completedBars} from './engine.js';
import {SPECS, usdToDist} from './symbols.js';

export const MTF_ADX_TREND = 18, MTF_ADX_RANGE = 22;

export function ema(arr, len){
  const k = 2 / (len + 1), out = []; let e = arr[0];
  for(let i = 0; i < arr.length; i++){ e = i === 0 ? arr[0] : arr[i] * k + e * (1 - k); out.push(e) }
  return out;
}
/* SamuSignal wala ATR (pehle len ka average, phir Wilder) */
export function atrS(b, len){
  const tr = [];
  for(let i = 0; i < b.length; i++) tr.push(i === 0 ? b[i].h - b[i].l : Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c)));
  const out = []; let a = tr.slice(0, len).reduce((x, y) => x + y, 0) / len;
  for(let i = 0; i < tr.length; i++){ if(i < len) out.push(a); else { a = (a * (len - 1) + tr[i]) / len; out.push(a) } }
  return out;
}
function adxRaw(b, n){
  let pdm = 0, ndm = 0, tr = 0;
  for(let i = b.length - n; i < b.length; i++){
    if(i < 1) continue;
    const up = b[i].h - b[i - 1].h, dn = b[i - 1].l - b[i].l;
    if(up > dn && up > 0) pdm += up; if(dn > up && dn > 0) ndm += dn;
    tr += Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c));
  }
  if(!tr) return {adx: 0};
  const pdi = pdm / tr * 100, ndi = ndm / tr * 100;
  return {adx: (pdi + ndi) === 0 ? 0 : Math.abs(pdi - ndi) / (pdi + ndi) * 100};
}
export function adx(b, n){
  const bs = b.slice(-(n * 10 + 1));
  if(bs.length < 2 * n + 1) return adxRaw(bs, n);
  let tr = 0, pdm = 0, ndm = 0, dxSum = 0, ax = 0;
  for(let i = 1; i < bs.length; i++){
    const up = bs[i].h - bs[i - 1].h, dn = bs[i - 1].l - bs[i].l;
    const p = (up > dn && up > 0) ? up : 0, m = (dn > up && dn > 0) ? dn : 0;
    const t = Math.max(bs[i].h - bs[i].l, Math.abs(bs[i].h - bs[i - 1].c), Math.abs(bs[i].l - bs[i - 1].c));
    if(i <= n){ tr += t; pdm += p; ndm += m; if(i < n) continue }
    else { tr = tr - tr / n + t; pdm = pdm - pdm / n + p; ndm = ndm - ndm / n + m }
    const pdi = tr ? pdm / tr * 100 : 0, ndi = tr ? ndm / tr * 100 : 0;
    const dx = (pdi + ndi) ? Math.abs(pdi - ndi) / (pdi + ndi) * 100 : 0;
    const k = i - n + 1;
    if(k <= n){ dxSum += dx; ax = dxSum / k } else ax = (ax * (n - 1) + dx) / n;
  }
  return {adx: ax};
}
const hh = (b, n) => Math.max(...b.slice(-n).map(x => x.h));
const ll = (b, n) => Math.min(...b.slice(-n).map(x => x.l));

/* SamuSignal mtfRead */
export function mtfRead(bars){
  const c = bars.map(b => b.c), n = c.length;
  const e21 = ema(c, 21), e50 = ema(c, 50), A = atrS(bars, 14);
  const p = c[n - 1], a = A[n - 1] || 0;
  const slope = n > 6 ? e21[n - 1] - e21[n - 6] : 0;
  const ax = n > 30 ? (adx(bars, 14).adx || 0) : 0;
  const strong = n <= 30 || ax >= MTF_ADX_TREND;
  let t = 'FLAT';
  if(strong && p > e21[n - 1] && e21[n - 1] > e50[n - 1] && slope > 0) t = 'UP';
  else if(strong && p < e21[n - 1] && e21[n - 1] < e50[n - 1] && slope < 0) t = 'DOWN';
  return {t, p, atr: a, adx: ax, hi: hh(bars, 32), lo: ll(bars, 32)};
}
/* SamuSignal mtfGate (v10.6.6) */
export function mtfGate(R, tpDist){
  const h = R['1h'].t, m = R['15min'].t, r15 = R['15min'];
  const ar = x => x === 'UP' ? '↑' : x === 'DOWN' ? '↓' : '→';
  if(m !== 'FLAT' && h !== 'FLAT' && m !== h) return {mode: 'NONE', why: `15m ${ar(m)} aur 1H ${ar(h)} ulte chal rahe hain — aise me trade nahi`};
  if(m !== 'FLAT' && h === 'FLAT') return {mode: m, cat: 'naya', why: `Naya trend — 15m ${m === 'UP' ? 'uptrend' : 'downtrend'}, 1H abhi flat (chaal shuru me)`};
  if(m !== 'FLAT' && m === h) return {mode: 'NONE', cat: 'purana', why: `Trend purana — 15m aur 1H dono ${m === 'UP' ? 'upar' : 'neeche'}, chaal der se, palatne ka khatra`};
  if(m === 'FLAT' && h !== 'FLAT') return {mode: 'NONE', cat: 'rest', why: `15m ruka hua (rest), 1H ${h === 'UP' ? 'upar' : 'neeche'} — abhi trade nahi`};
  const width = r15.hi - r15.lo;
  if(r15.adx < MTF_ADX_RANGE && width >= 2 * tpDist) return {mode: 'RANGE', cat: 'range', why: `1H aur 15m dono flat (15m ADX ${r15.adx.toFixed(0)}) — range`};
  return {mode: 'NONE', why: r15.adx >= MTF_ADX_RANGE ? `Trend saaf nahi aur range bhi nahi (15m ADX ${r15.adx.toFixed(0)}) — gadbad market` : 'Range bahut patli hai — TP tak jagah nahi'};
}

/* gate + Fib leg -> order (pure, test ke liye alag) */
export function fibPlan(g, b15, ctx, cfg = {}){
  const out = {mode: g.mode, cat: g.cat || '', why: [g.why], legs: [], leg: null};
  if(g.mode === 'NONE') return out;
  if(g.mode === 'RANGE'){ out.mode = 'NONE'; out.why.push('Fib sirf trend me — range me order nahi'); return out }
  const leg = fibLeg(b15, g.mode, cfg);
  if(!leg || leg.bad){ out.mode = 'NONE'; out.why.push('Fib swing pakka nahi — ' + (leg && leg.bad || 'swing nahi mila')); return out }
  out.leg = leg;
  const up = g.mode === 'UP', dir = up ? 'BUY' : 'SELL', sg = up ? 1 : -1;
  const minD = Math.max(0.2 * ctx.a5, 3 * ctx.pip), maxD = Math.max(2 * ctx.a15, 1.2 * ctx.gap);
  const chk = (entry, side) => { const d = (entry - ctx.live) * side;
    return d <= 0 ? (side < 0 ? 'live price pehle hi iske neeche hai' : 'live price pehle hi iske upar hai') : d < minD ? 'live ke bahut paas' : d > maxD ? 'bahut door — 60 min me pahunchna mushkil' : '' };
  const lim = leg.lvl618, stp = leg.end.px + sg * (0.35 * ctx.a5 + ctx.spread);
  const L1 = {dir, kind: 'LIMIT', side: up ? -1 : 1, entry: lim, why: 'Fib 61.8% (pullback)'};
  const L2 = {dir, kind: 'STOP', side: up ? 1 : -1, entry: stp, why: `swing ${up ? 'high' : 'low'} ke paar (breakout)`};
  for(const L of [L1, L2]){ L.bad = chk(L.entry, L.side); L.ok = !L.bad; out.legs.push(L) }
  if(!out.legs.some(L => L.ok)){ out.mode = 'NONE'; out.why.push('Dono bhaav sahi doori pe nahi — NO TRADE') }
  return out;
}

/* poora analysis: data {1h, 15min, 5min} (+ live bid), now ms */
export function chartAnalyze(data, now, sym, opt = {}){
  const sp = SPECS[sym];
  const b60 = completedBars(data['1h'] || [], '1h', now).slice(-120);
  const b15all = completedBars(data['15min'] || [], '15min', now);
  const b15 = b15all.slice(-120), b5 = completedBars(data['5min'] || [], '5min', now).slice(-120);
  if(b60.length < 60 || b15.length < 60 || b5.length < 60) return {mode: 'NONE', why: ['kaafi candles nahi'], legs: []};
  const R = {'1h': mtfRead(b60), '15min': mtfRead(b15), '5min': mtfRead(b5)};
  const live = opt.live > 0 ? opt.live : b5[b5.length - 1].c;
  const tpUsd = opt.tpUsd || 3, gapUsd = opt.gapUsd || 5;
  const g = mtfGate(R, usdToDist(sym, tpUsd, 0.01));
  const ctx = {live, a5: R['5min'].atr, a15: R['15min'].atr, pip: sp.pip, gap: usdToDist(sym, gapUsd, 0.01),
    spread: (opt.spreadPips != null ? opt.spreadPips : sp.spreadPips) * sp.pip};
  const plan = fibPlan(g, b15all.slice(-320), ctx);
  /* +$1 andaza (SamuSignal: 160 min x $1 doori / max(ATR15, pichhle ghante ki range / 2)) */
  const h4 = b15.slice(-4), hr = Math.max(...h4.map(x => x.h)) - Math.min(...h4.map(x => x.l));
  const aEff = Math.max(ctx.a15, hr / 2);
  plan.eta = aEff > 0 ? Math.max(15, Math.round(160 * usdToDist(sym, 1, 0.01) / aEff / 15) * 15) : null;
  plan.trends = {h1: R['1h'].t, m15: R['15min'].t, m5: R['5min'].t, adx15: +R['15min'].adx.toFixed(0)};
  plan.live = live; plan.dataTime = b5[b5.length - 1].t; plan.sym = sym;
  return plan;
}
