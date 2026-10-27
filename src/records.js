/* Records — "Signal bana" aur "Maine liya" ALAG. Dono ke nateeje kabhi mile-jule nahi.
   Nateeja (result) sirf signal ke BAAD ki band candles se: SL pehle ya TP pehle (ek hi candle me dono = SL, imaandaar). */
import {LS} from './data.js';
import {distToUsd} from './symbols.js';

export const MIN_N = 30;
const key = k => k === 'taken' ? 'recTaken' : k === 'fib' ? 'recFib' : 'recSig';
export const list = k => LS.get(key(k), []);
function put(k, a){ LS.set(key(k), a.slice(0, 500)) }

export function addSignal(sig){
  const a = list('sig');
  const id = sig.sym + '|' + sig.confirm.t;
  if(a.some(r => r.id === id)) return false;
  a.unshift({id, sym: sig.sym, dir: sig.dir, setup: sig.setup, at: sig.confirm.t, entry: sig.entry, sl: sig.sl, tp: sig.tp, rr: sig.rr, src: sig.src, res: null});
  put('sig', a); return true;
}
export function addTaken(sig, price){
  const a = list('taken');
  a.unshift({id: sig.sym + '|' + sig.confirm.t + '|' + Date.now(), sym: sig.sym, dir: sig.dir, setup: sig.setup, at: Date.now(), entry: +price || sig.entry, sl: sig.sl, tp: sig.tp, res: null});
  put('taken', a);
}

/* bars (5m, band) se result */
export function settle(rec, bars5){
  const buy = rec.dir === 'BUY';
  let mae = 0, mfe = 0;
  for(const b of bars5){
    if(b.t < rec.at) continue;
    const adv = buy ? rec.entry - b.l : b.h - rec.entry, fav = buy ? b.h - rec.entry : rec.entry - b.l;
    mae = Math.max(mae, adv); mfe = Math.max(mfe, fav);
    const hitSL = buy ? b.l <= rec.sl : b.h >= rec.sl, hitTP = buy ? b.h >= rec.tp : b.l <= rec.tp;
    if(hitSL) return {r: 'SL', R: -1, mae, mfe, end: b.t};
    if(hitTP) return {r: 'TP', R: Math.abs(rec.tp - rec.entry) / Math.abs(rec.entry - rec.sl), mae, mfe, end: b.t};
  }
  return null;
}

export function stats(a, sym2usd){
  const done = a.filter(r => r.res);
  const n = done.length, W = done.filter(r => r.res.R > 0), L = done.filter(r => r.res.R <= 0);
  const sumW = W.reduce((s, r) => s + r.res.R, 0), sumL = -L.reduce((s, r) => s + r.res.R, 0);
  let eq = 0, pk = 0, dd = 0;
  done.slice().reverse().forEach(r => { eq += r.res.R; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq) });
  return {n, win: n ? W.length / n : null, exp: n ? (sumW - sumL) / n : null, pf: sumL ? sumW / sumL : (sumW ? Infinity : null),
    maxDD: dd, enough: n >= MIN_N};
}
export {distToUsd};

/* 📈 Chart Analysis (Fib LIMIT/STOP) records — PERSONAL FX Strategy 2 niyam se hisaab:
   60 min me pehla bhara order; phir -$3 SL / +$3 TP / +$1 pe +$0.50 lock (har $0.10 aage). 0.01 lot pe $. */
export function addFib(plan, sent){
  const a = list('fib');
  a.unshift({id: plan.sym + '|' + Date.now(), sym: plan.sym, at: Date.now(), mode: plan.mode, sent: !!sent,
    legs: plan.legs.filter(L => L.ok).map(L => ({dir: L.dir, kind: L.kind, entry: L.entry})), res: null});
  put('fib', a);
}
export function settleFib(rec, bars5, usd1, spread){
  const h = (spread || 0) / 2; let fill = null;
  for(const b of bars5){
    if(b.t < rec.at || b.t > rec.at + 3600e3) continue;        /* order ke baad khuli candles hi */
    for(const L of rec.legs){ const buy = L.dir === 'BUY';
      const hit = L.kind === 'LIMIT' ? (buy ? b.l <= L.entry - h : b.h >= L.entry + h) : (buy ? b.h >= L.entry + h : b.l <= L.entry - h);
      if(hit){ fill = {L, t: b.t}; break } }
    if(fill) break;
  }
  const last = bars5.length ? bars5[bars5.length - 1].t : 0;
  if(!fill) return last > rec.at + 3600e3 ? {r: 'NOFILL', usd: 0} : null;
  const buy = fill.L.dir === 'BUY', e = fill.L.entry; let lock = null;
  for(const b of bars5){
    if(b.t < fill.t) continue;
    const adv = ((buy ? e - b.l : b.h - e) + h) / usd1, fav = ((buy ? b.h - e : e - b.l) - h) / usd1;
    if(lock === null && adv >= 3) return {r: 'SL', usd: -3, kind: fill.L.kind};
    if(lock !== null && -adv <= lock) return {r: 'LOCK', usd: lock, kind: fill.L.kind};
    if(b.t > fill.t){ if(fav >= 3) return {r: 'TP', usd: 3, kind: fill.L.kind}; if(fav >= 1){ const nl = Math.floor((fav - 0.5) * 10 + 1e-9) / 10; if(lock === null || nl > lock) lock = nl } }
  }
  return null;
}
