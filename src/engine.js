/* SamuSignal Pro FIB — analysis engine (pure functions, koi network nahi)
   ---------------------------------------------------------------------------------
   Niyam (prompt ke hisaab se):
   - Sirf COMPLETED candles. Bann rahi candle hata di jaati hai (completedBars).
   - Swing (pivot) tabhi pakka jab uske baad k band candles aa chuki hon — non-repainting.
     Kisi bhi waqt T ka faisla sirf T tak ki candles se (backtest me future candle nahi).
   - Uptrend: pakka swing LOW -> swing HIGH; 61.8% zone pe sirf BUY-continuation.
     Downtrend: swing HIGH -> swing LOW; 61.8% zone pe sirf SELL-continuation.
   - 1H = mukhya trend, 15m = setup (Fib leg), 5m = entry confirmation. 1m disha tay nahi karta.
   - Zone chhoona signal NAHI: pehle WAIT FOR REJECTION, phir band hui rejection candle = CONFIRMED.
   - Breakout alag mode: 5m candle ka swing ke paar CLOSE + phir retest/hold = CONFIRMED. Wick se nahi.
   - Target tak jagah (agla resistance/support) + spread/cost ke baad R:R — hard filter.
   - SL: structure invalidation (78.6% / swing) ke paar + ATR buffer.
   Bars: {t: open time ms UTC, o, h, l, c}. */

export const TF_MS = {'1min': 60e3, '5min': 300e3, '15min': 900e3, '1h': 3600e3};

export const STATES = ['NO SETUP', 'WAIT FOR FIB ZONE', 'WAIT FOR REJECTION', 'WAIT FOR BREAKOUT RETEST',
  'CONFIRMED', 'INVALIDATED', 'EXPIRED'];

export const DEFAULTS = {
  emaFast: 21, emaSlow: 50, slopeBars: 5,
  pivotK15: 3, pivotK60: 3,          /* pivot ke dono taraf itni candles */
  minLegAtr: 2.0,                    /* Fib leg kam se kam itne 15m ATR ka */
  zoneFrom: 0.58, zoneTo: 0.66,      /* 61.8% ke aas-paas retracement band */
  invalidRetr: 0.786,                /* iske paar 5m close = INVALIDATED */
  slAtr: 0.3,                        /* SL = invalidation ke paar + itna 15m ATR */
  minRR: 1.5,                        /* cost ke baad kam se kam R:R */
  minRoomAtr: 0.6,                   /* target tak kam se kam itni jagah (15m ATR) */
  rejectWinBars: 6,                  /* zone touch ke baad itni 5m candles me rejection, warna EXPIRED */
  signalLifeBars: 2,                 /* CONFIRMED signal itni 5m candles tak valid */
  chaseAtr: 0.5,                     /* entry se itna (15m ATR) door nikal gaya = EXPIRED (chase nahi) */
  retestBufAtr: 0.15,                /* breakout retest: swing level se itna paas aana */
  breakoutWinBars: 12,               /* breakout close ke baad itni 5m candles me retest, warna EXPIRED */
  brkTargetExt: 0.618,               /* breakout target = swing + leg x ye (agar resistance na mile) */
  h1Mode: 'same',                    /* 'same' = 1H bhi wahi trend | 'notOpposite' = 1H ulta na ho */
  staleMin: 15,                      /* 5m data itne min se purana = STALE */
  spreadPips: null,                  /* null = symbol ka default */
  commissionPips: 0, slippagePips: 0.2
};

/* ---------------- basics ---------------- */
export function completedBars(bars, tf, now){
  const d = TF_MS[tf];
  return bars.filter(b => b.t + d <= now);
}
export function ema(vals, n){
  const k = 2 / (n + 1), out = [];
  let e;
  for(let i = 0; i < vals.length; i++){ e = i === 0 ? vals[0] : vals[i] * k + e * (1 - k); out.push(e) }
  return out;
}
export function atr(bars, n = 14){
  const out = []; let a = 0;
  for(let i = 0; i < bars.length; i++){
    const b = bars[i], tr = i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c));
    a = i < n ? (a * i + tr) / (i + 1) : (a * (n - 1) + tr) / n;
    out.push(a);
  }
  return out;
}

/* pivots: index i pakka sirf tab jab i+k <= aakhri index (k candles baad me aa chuki) */
export function pivots(bars, k){
  const out = [];
  for(let i = k; i < bars.length - k; i++){
    let H = true, L = true;
    for(let j = i - k; j <= i + k; j++){
      if(j === i) continue;
      /* baayein: sakhti se neeche/upar; daayein: barabar chalega (pehla wala pivot) */
      if(j < i ? bars[j].h >= bars[i].h : bars[j].h > bars[i].h) H = false;
      if(j < i ? bars[j].l <= bars[i].l : bars[j].l < bars[i].l) L = false;
    }
    if(H) out.push({i, t: bars[i].t, px: bars[i].h, type: 'H', confIdx: i + k});
    if(L) out.push({i, t: bars[i].t, px: bars[i].l, type: 'L', confIdx: i + k});
  }
  return out;
}

/* trend: EMA21 / EMA50 + EMA50 ki dhalaan + price ki jagah */
export function trend(bars, cfg0){
  const cfg = Object.assign({}, DEFAULTS, cfg0);
  if(bars.length < cfg.emaSlow + cfg.slopeBars + 2) return {t: 'RANGE', why: 'kaafi candles nahi'};
  const c = bars.map(b => b.c), f = ema(c, cfg.emaFast), s = ema(c, cfg.emaSlow), n = c.length - 1;
  const slope = s[n] - s[n - cfg.slopeBars];
  if(f[n] > s[n] && c[n] > s[n] && slope > 0) return {t: 'UP', why: 'EMA21 > EMA50, EMA50 upar ja rahi'};
  if(f[n] < s[n] && c[n] < s[n] && slope < 0) return {t: 'DOWN', why: 'EMA21 < EMA50, EMA50 neeche ja rahi'};
  return {t: 'RANGE', why: 'EMA saaf disha me nahi'};
}

/* Fib leg (15m): UP = aakhri pakka swing HIGH + usse pehle ka aakhri pakka swing LOW */
export function fibLeg(bars, dir, cfg0){
  const cfg = Object.assign({}, DEFAULTS, cfg0);
  const P = pivots(bars, cfg.pivotK15), A = atr(bars, 14), a = A[A.length - 1] || 0;
  const hiType = dir === 'UP' ? 'H' : 'L', loType = dir === 'UP' ? 'L' : 'H';
  const ends = P.filter(p => p.type === hiType);
  if(!ends.length) return null;
  const end = ends[ends.length - 1];
  const starts = P.filter(p => p.type === loType && p.i < end.i);
  if(!starts.length) return null;
  const start = starts[starts.length - 1];
  const size = Math.abs(end.px - start.px);
  if(!(a > 0) || size < cfg.minLegAtr * a) return {bad: `leg chhota (${(size / (a || 1)).toFixed(1)} ATR < ${cfg.minLegAtr})`};
  /* start aur end ke beech koi candle start se aage na gayi ho (saaf impulse) */
  for(let i = start.i + 1; i < end.i; i++){
    if(dir === 'UP' ? bars[i].l < start.px : bars[i].h > start.px) return {bad: 'swing saaf nahi (beech me naya low/high)'};
  }
  const sg = dir === 'UP' ? 1 : -1, lv = r => end.px - sg * r * size;
  return {dir, start, end, size, atr: a, confIdx: end.confIdx, confT: bars[end.confIdx].t + TF_MS['15min'],
    lvl618: lv(0.618), zone: [lv(cfg.zoneTo), lv(cfg.zoneFrom)].sort((x, y) => x - y), invalid: lv(cfg.invalidRetr)};
}

/* agla resistance (BUY) / support (SELL): 1H + 15m ke pakke pivots me se entry ke sabse paas */
export function nextLevel(entry, dir, b60, b15, cfg0, beforeT = Infinity){
  const cfg = Object.assign({}, DEFAULTS, cfg0);
  /* sirf leg khatam hone se PEHLE ke pivots — pullback ke andar bane chhote lower-high / higher-low
     (jo retracement ka hissa hain) ko target-rokne wala resistance nahi maante */
  /* aur sirf "na tute" level: pivot ke baad kisi candle ne uske paar CLOSE nahi kiya (tuta high = ab support, rukawat nahi) */
  const intact = (bars, p) => { for(let i = p.i + 1; i < bars.length; i++){ if(p.type === 'H' ? bars[i].c > p.px : bars[i].c < p.px) return false } return true };
  const P = pivots(b60, cfg.pivotK60).filter(p => intact(b60, p)).concat(pivots(b15, cfg.pivotK15).filter(p => intact(b15, p))).filter(p => p.t < beforeT);
  const want = dir === 'UP' ? 'H' : 'L';
  const lv = P.filter(p => p.type === want && (dir === 'UP' ? p.px > entry : p.px < entry)).map(p => p.px);
  if(!lv.length) return null;
  return dir === 'UP' ? Math.min(...lv) : Math.max(...lv);
}

/* ---------------- main ---------------- */
/* data: {'1h': bars, '15min': bars, '5min': bars, '1min'?: bars}  now: ms UTC
   sym spec: {pip, digits, spreadPips}. live spread (pips) diya ho to wahi. */
export function analyze(data, now, spec, cfg0 = {}, live = {}){
  const cfg = Object.assign({}, DEFAULTS, cfg0);
  const b60 = completedBars(data['1h'] || [], '1h', now).slice(-300);
  const b15 = completedBars(data['15min'] || [], '15min', now).slice(-300);
  const b5 = completedBars(data['5min'] || [], '5min', now).slice(-400);
  const out = {state: 'NO SETUP', dir: null, setup: null, why: [], trends: {}, dataTime: b5.length ? b5[b5.length - 1].t : null};
  if(!b5.length || now - (b5[b5.length - 1].t + TF_MS['5min']) > cfg.staleMin * 60e3){
    out.stale = true; out.why.push('Data purana / nahi — STALE, signal band'); return out;
  }
  const t60 = trend(b60, cfg), t15 = trend(b15, cfg), t5 = trend(b5, cfg);
  out.trends = {h1: t60.t, m15: t15.t, m5: t5.t};
  if(t15.t === 'RANGE'){ out.why.push('15m me saaf trend nahi (range) — NO TRADE'); return out }
  if(t60.t !== 'RANGE' && t60.t !== t15.t){ out.why.push(`1H ${t60.t} aur 15m ${t15.t} ulte — conflict, NO TRADE`); return out }
  if(cfg.h1Mode === 'same' && t60.t !== t15.t){ out.why.push(`1H ${t60.t} — mukhya trend 15m (${t15.t}) ke saath nahi, WAIT`); return out }
  const dir = t15.t, sg = dir === 'UP' ? 1 : -1;
  out.dir = dir === 'UP' ? 'BUY' : 'SELL';
  const leg = fibLeg(b15, dir, cfg);
  if(!leg || leg.bad){ out.why.push('Fib swing pakka nahi — ' + (leg && leg.bad || 'swing nahi mila')); return out }
  out.anchors = {from: leg.start.px, fromT: leg.start.t, to: leg.end.px, toT: leg.end.t};
  out.lvl618 = leg.lvl618; out.zone = leg.zone; out.invalid = leg.invalid;
  const sp = spec || {pip: 0.0001, digits: 5, spreadPips: 2};
  const costPx = ((live.spreadPips != null ? live.spreadPips : (cfg.spreadPips != null ? cfg.spreadPips : sp.spreadPips)) + cfg.commissionPips + cfg.slippagePips) * sp.pip;
  out.costPips = costPx / sp.pip;
  const A = leg.atr;
  const zTop = dir === 'UP' ? leg.zone[1] : leg.zone[0];       /* zone ka woh kinara jo pehle chhua jaata hai */
  /* 5m candles jo leg pakka hone ke BAAD band huin */
  const after = b5.filter(b => b.t >= leg.confT);
  let st = 'WAIT FOR FIB ZONE', touchIdx = -1, brkIdx = -1, conf = null, why = '';
  for(let i = 0; i < after.length; i++){
    const b = after[i];
    const beyondInvalid = dir === 'UP' ? b.c < leg.invalid : b.c > leg.invalid;
    if(conf){                                                    /* CONFIRMED ke baad: life / chase */
      const age = i - conf.idx;
      const run = (b.c - conf.entry) * sg;
      if(beyondInvalid){ st = 'INVALIDATED'; why = '5m close invalidation ke paar'; conf = null; break }
      if(run > cfg.chaseAtr * A){ st = 'EXPIRED'; why = 'price entry se door nikal gaya — chase nahi'; break }
      if(age >= cfg.signalLifeBars){ st = 'EXPIRED'; why = `signal ${cfg.signalLifeBars} candle me use nahi hua`; break }
      continue;
    }
    if(beyondInvalid){ st = 'INVALIDATED'; why = `5m close ${(cfg.invalidRetr * 100).toFixed(1)}% ke paar — setup toota`; break }
    /* breakout: 5m CLOSE swing ke paar (wick nahi) */
    if(brkIdx < 0 && (b.c - leg.end.px) * sg > 0){ brkIdx = i; st = 'WAIT FOR BREAKOUT RETEST'; why = '5m close swing ke paar — retest ka intezaar'; touchIdx = -1; continue }
    if(brkIdx >= 0){
      if(i - brkIdx > cfg.breakoutWinBars){ st = 'EXPIRED'; why = 'breakout ke baad retest nahi aaya'; break }
      const near = dir === 'UP' ? b.l <= leg.end.px + cfg.retestBufAtr * A : b.h >= leg.end.px - cfg.retestBufAtr * A;
      const hold = (b.c - leg.end.px) * sg > 0 && (b.c - b.o) * sg > 0;
      if((b.c - leg.end.px) * sg < -cfg.retestBufAtr * A){ st = 'INVALIDATED'; why = 'breakout fail — wapas swing ke andar band'; break }
      if(near && hold){
        conf = {idx: i, t: b.t + TF_MS['5min'], entry: b.c, setup: 'BREAKOUT', why: 'retest ke baad swing ke upar band (hold)', lowHigh: dir === 'UP' ? b.l : b.h};
        st = 'CONFIRMED';
      }
      continue;
    }
    /* pullback: zone chhuna (wick bhi chalega) = sirf WAIT FOR REJECTION */
    const touched = dir === 'UP' ? b.l <= zTop : b.h >= zTop;
    if(touchIdx < 0 && touched){ touchIdx = i; st = 'WAIT FOR REJECTION'; why = '61.8% zone chhua — band hui rejection candle ka intezaar' }
    if(touchIdx >= 0){
      if(i - touchIdx >= cfg.rejectWinBars && !conf){ st = 'EXPIRED'; why = `zone ke baad ${cfg.rejectWinBars} candle me rejection nahi`; break }
      const bodyDir = (b.c - b.o) * sg > 0;
      const backAbove = (b.c - leg.lvl618) * sg > 0;
      const wickIn = dir === 'UP' ? b.l <= zTop : b.h >= zTop;
      const wick = dir === 'UP' ? Math.min(b.o, b.c) - b.l : b.h - Math.max(b.o, b.c), body = Math.abs(b.c - b.o);
      if(bodyDir && backAbove && wickIn && wick >= 0.3 * body){
        conf = {idx: i, t: b.t + TF_MS['5min'], entry: b.c, setup: 'PULLBACK', why: `${dir === 'UP' ? 'bullish' : 'bearish'} rejection candle — zone se ${dir === 'UP' ? 'upar' : 'neeche'} band`, lowHigh: dir === 'UP' ? b.l : b.h};
        st = 'CONFIRMED';
      }
    }
  }
  out.state = st;
  if(st !== 'CONFIRMED'){ out.why.push(why || 'trend + Fib leg theek — price abhi 61.8% zone tak nahi aaya'); return out }
  /* ---- CONFIRMED: SL / TP / jagah / cost ---- */
  const E = conf.entry;
  const slBase = conf.setup === 'PULLBACK' ? (dir === 'UP' ? Math.min(leg.invalid, conf.lowHigh) : Math.max(leg.invalid, conf.lowHigh))
                                           : (dir === 'UP' ? Math.min(leg.end.px, conf.lowHigh) : Math.max(leg.end.px, conf.lowHigh));
  const sl = slBase - sg * cfg.slAtr * A;
  let tp = conf.setup === 'PULLBACK' ? leg.end.px : leg.end.px + sg * cfg.brkTargetExt * leg.size;
  const nx = nextLevel(E, dir, b60, b15, cfg, leg.end.t);
  if(nx !== null && (nx - E) * sg < (tp - E) * sg) tp = nx;       /* beech me resistance/support = wahi target */
  const reward = (tp - E) * sg - costPx, risk = (E - sl) * sg + costPx;
  const rr = risk > 0 ? reward / risk : 0;
  Object.assign(out, {setup: conf.setup, entry: E, sl, tp, rr, risk, reward, confirm: {t: conf.t, why: conf.why}, expiresAt: conf.t + cfg.signalLifeBars * TF_MS['5min']});
  if(reward < cfg.minRoomAtr * A){ out.state = 'NO SETUP'; out.rejected = 'room'; out.why.push(`target tak jagah kam (${(reward / A).toFixed(2)} ATR, cost ke baad) — NO TRADE`); return out }
  if(rr < cfg.minRR){ out.state = 'NO SETUP'; out.rejected = 'rr'; out.why.push(`R:R ${rr.toFixed(2)} < ${cfg.minRR} (spread/cost ke baad) — NO TRADE`); return out }
  out.why.push(conf.why);
  return out;
}
