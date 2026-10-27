/* Records — "Signal bana" aur "Maine liya" ALAG. Dono ke nateeje kabhi mile-jule nahi.
   Nateeja (result) sirf signal ke BAAD ki band candles se: SL pehle ya TP pehle (ek hi candle me dono = SL, imaandaar). */
import {LS} from './data.js';
import {distToUsd} from './symbols.js';

export const MIN_N = 30;
const key = k => k === 'taken' ? 'recTaken' : 'recSig';
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
