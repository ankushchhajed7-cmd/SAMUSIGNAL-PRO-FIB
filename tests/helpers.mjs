/* test data: ek 5m price path banao, usse 15m / 1H jodo (aggregation) — teeno timeframe aapas me sahi */
export const T0 = Date.UTC(2026, 9, 5, 0, 0);         /* Monday 00:00 UTC */
export const M5 = 300e3;

/* points: [[idx15, price], ...] 15m index pe -> 5m closes (har 15m = 3 x 5m) */
export function pathCloses(points){
  const out = [];
  for(let k = 0; k < points.length - 1; k++){
    const [i0, p0] = points[k], [i1, p1] = points[k + 1];
    const n = (i1 - i0) * 3;
    for(let s = 0; s < n; s++) out.push(p0 + (p1 - p0) * (s / n));
  }
  out.push(points[points.length - 1][1]);
  return out;
}

/* closes -> 5m bars (o = pichhla close, chhoti wick) */
export function bars5(closes, wick = 0.05, start = T0){
  return closes.map((c, i) => {
    const o = i ? closes[i - 1] : c;
    return {t: start + i * M5, o, h: Math.max(o, c) + wick, l: Math.min(o, c) - wick, c};
  });
}

/* explicit candles jodo: [{o,h,l,c}] */
export function append5(bars, candles){
  const out = bars.slice();
  for(const k of candles) out.push({t: out[out.length - 1].t + M5, ...k});
  return out;
}

export function agg(b5, ms){
  const out = [];
  for(const b of b5){
    const k = Math.floor(b.t / ms) * ms, l = out[out.length - 1];
    if(l && l.t === k){ l.h = Math.max(l.h, b.h); l.l = Math.min(l.l, b.l); l.c = b.c }
    else out.push({t: k, o: b.o, h: b.h, l: b.l, c: b.c});
  }
  return out;
}

export function dataFrom(b5){
  return {'5min': b5, '15min': agg(b5, 900e3), '1h': agg(b5, 3600e3)};
}

/* "now" = aakhri 5m candle band hone ka pal (sab candles complete) */
export const nowAfter = b5 => b5[b5.length - 1].t + M5;

/* uptrend base: lamba uptrend, phir swing LOW (~171+off) -> swing HIGH (183+off) -> 4 candle (15m) halka neeche (H pakka) */
export function upBase(){
  return pathCloses([[0, 60], [270, 171], [276, 174.5], [282, 171], [294, 183], [298, 181.4]]);
}

export const SPEC = {pip: 0.01, digits: 3, spreadPips: 2};
export const CFG = {pivotK15: 3, minLegAtr: 2, slippagePips: 0, spreadPips: 2};
