/* Backtest — usage: node tools/backtest.mjs <dataDir> [--split 0.6] [--json out.json]
   dataDir me files: EURUSD_1h.json, EURUSD_15min.json, EURUSD_5min.json  ([[ms,o,h,l,c], ...], UTC open time)
   - Har 5m candle band hone pe analyze(), sirf us waqt tak ki candles se (lookahead nahi).
   - CONFIRMED -> agli 5m candle ke open pe MARKET entry (+ spread + slippage), SL / TP pe exit.
     Ek hi candle me SL aur TP dono = SL (imaandaar). Ek pair pe ek waqt me ek trade. 3 din me na nikle = band (close pe).
   - Samay ke hisaab se split: pehla hissa in-sample, baaki out-of-sample. Tuning sirf in-sample pe. */
import fs from 'node:fs';
import path from 'node:path';
import {analyze, TF_MS} from '../src/engine.js';
import {SPECS, FX, distToUsd} from '../src/symbols.js';

const args = process.argv.slice(2);
const dir = args[0];
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null };
const SPLIT = +(opt('--split') || 0.6), OUT = opt('--json'), CFG = JSON.parse(opt('--cfg') || '{}');
if(!dir){ console.error('usage: node tools/backtest.mjs <dataDir>'); process.exit(1) }

const load = (name, tf) => { const p = path.join(dir, `${name}_${tf}.json`); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)).map(r => ({t: r[0], o: r[1], h: r[2], l: r[3], c: r[4]})) : null };
const upto = (A, T) => { let lo = 0, hi = A.length; while(lo < hi){ const m = (lo + hi) >> 1; if(A[m].t < T) lo = m + 1; else hi = m } return lo };   /* candles jinka open < T */
const ist = t => ((Math.floor((t + 330 * 60e3) / 60e3) % 1440) + 1440) % 1440;
const session = t => { const m = ist(t); return m >= 150 && m < 750 ? 'Asia' : m >= 750 && m < 1110 ? 'London' : 'NY' };

const trades = [];
let span = [Infinity, 0], pairs = 0;
for(const sym of FX){
  const sp = SPECS[sym], D = {'1h': load(sp.name, '1h'), '15min': load(sp.name, '15min'), '5min': load(sp.name, '5min')};
  if(!D['1h'] || !D['15min'] || !D['5min']) continue;
  pairs++;
  const B5 = D['5min'];
  let open = null, lastConf = 0;
  for(let i = 200; i < B5.length; i++){
    const now = B5[i].t;                                      /* B5[i-1] abhi band hui */
    if(now - B5[i - 1].t > 10 * 60e3) continue;               /* gap (weekend) */
    span = [Math.min(span[0], now), Math.max(span[1], now)];
    if(open){                                                 /* chalu trade: candle i-1 ka nateeja */
      const b = B5[i - 1], buy = open.dir === 'BUY';
      if(b.t >= open.t0){
        open.mae = Math.max(open.mae, buy ? open.entry - b.l : b.h - open.entry);
        open.mfe = Math.max(open.mfe, buy ? b.h - open.entry : open.entry - b.l);
        const hitSL = buy ? b.l <= open.sl : b.h >= open.sl, hitTP = buy ? b.h >= open.tp : b.l <= open.tp;
        let exit = null;
        if(hitSL) exit = open.sl; else if(hitTP) exit = open.tp; else if(now - open.t0 > 3 * 86400e3) exit = b.c;
        if(exit !== null){
          const risk = Math.abs(open.entry - open.sl);
          open.R = ((exit - open.entry) * (buy ? 1 : -1)) / risk;
          open.usd = distToUsd(sym, exit - open.entry, 0.01) * Math.sign((exit - open.entry) * (buy ? 1 : -1));
          open.maeR = open.mae / risk; open.mfeR = open.mfe / risk; open.exitT = now;
          trades.push(open); open = null;
        }
      }
      continue;
    }
    const slice = {};
    for(const tf of ['1h', '15min', '5min']){ const A = D[tf], j = upto(A, now); slice[tf] = A.slice(Math.max(0, j - 320), j) }
    const r = analyze(slice, now, sp, CFG);
    if(r.state !== 'CONFIRMED' || r.confirm.t <= lastConf) continue;
    lastConf = r.confirm.t;
    const nb = B5[i]; if(!nb) break;                          /* agli candle ka open = entry */
    const sg = r.dir === 'BUY' ? 1 : -1, cost = r.costPips * sp.pip;
    const entry = nb.o + sg * cost;
    if((r.sl - entry) * sg >= 0 || (r.tp - entry) * sg <= 0) continue;   /* gap ne setup kha liya */
    open = {sym, dir: r.dir, setup: r.setup, t0: nb.t, entry, sl: r.sl, tp: r.tp, rrPlan: r.rr, costPips: r.costPips, mae: 0, mfe: 0, sess: session(nb.t)};
  }
}

const cut = span[0] + (span[1] - span[0]) * SPLIT;
const groups = (rows, key) => { const o = {}; rows.forEach(t => (o[key(t)] = o[key(t)] || []).push(t)); return o };
function metrics(a){
  const n = a.length; if(!n) return {n: 0};
  const W = a.filter(t => t.R > 0), sw = W.reduce((s, t) => s + t.R, 0), sl = -a.filter(t => t.R <= 0).reduce((s, t) => s + t.R, 0);
  let eq = 0, pk = 0, dd = 0; a.slice().sort((x, y) => x.exitT - y.exitT).forEach(t => { eq += t.R; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq) });
  const avg = f => a.reduce((s, t) => s + f(t), 0) / n;
  return {n, win: +(W.length / n * 100).toFixed(1), expR: +((sw - sl) / n).toFixed(3), pf: sl ? +(sw / sl).toFixed(2) : null, maxDD_R: +dd.toFixed(2),
    avgMAE_R: +avg(t => t.maeR).toFixed(2), avgMFE_R: +avg(t => t.mfeR).toFixed(2), avgCostPips: +avg(t => t.costPips).toFixed(2),
    usd001: +a.reduce((s, t) => s + t.usd, 0).toFixed(2), reliable: n >= 30 ? 'yes' : 'Not enough data for a reliable conclusion'};
}
const IS = trades.filter(t => t.t0 < cut), OOS = trades.filter(t => t.t0 >= cut);
const rep = {pairs, period: [new Date(span[0]).toISOString(), new Date(span[1]).toISOString()], split: new Date(cut).toISOString(), cfg: CFG,
  inSample: metrics(IS), outOfSample: metrics(OOS),
  oosBySetup: Object.fromEntries(Object.entries(groups(OOS, t => t.setup)).map(([k, v]) => [k, metrics(v)])),
  oosBySession: Object.fromEntries(Object.entries(groups(OOS, t => t.sess)).map(([k, v]) => [k, metrics(v)])),
  oosByPair: Object.fromEntries(Object.entries(groups(OOS, t => t.sym)).map(([k, v]) => [k, metrics(v)])),
  orderType: 'MARKET (confirmation ke baad agli candle ka open)'};
console.log(JSON.stringify(rep, null, 1));
if(OUT) fs.writeFileSync(OUT, JSON.stringify(Object.assign(rep, {trades}), null, 1));
