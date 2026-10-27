/* Data + settings
   ---------------------------------------------------------------------------------
   1) Settings: SamuSignal (same website ankushchhajed7-cmd.github.io) ki localStorage se
      SIRF PADHTE hain (samu_*). Kuch nahi likhte. Is app ki apni settings "sfib_*" me.
      Key / auth kabhi screen ya log me nahi dikhate.
   2) Candles: pehle MT5 Data Feed (Firebase /feed, broker ka exact bhaav, 0 credit),
      na mile to TwelveData (SamuSignal wali key). Dono na hon = DEMO DATA, live signal band. */
import {SPECS} from './symbols.js';
import {TF_MS} from './engine.js';

const SAMU = k => { try{ const v = localStorage.getItem('samu_' + k); return v === null ? undefined : JSON.parse(v) }catch(e){ return undefined } };
/* SamuSignal + PERSONAL FX + Data Feed EA ka default Firebase (public URL, secret nahi — auth alag) */
export const DEFAULT_FB = 'https://forexdiagnosis-default-rtdb.asia-southeast1.firebasedatabase.app';
export const LS = {
  get(k, d){ try{ const v = localStorage.getItem('sfib_' + k); return v === null ? d : JSON.parse(v) }catch(e){ return d } },
  set(k, v){ try{ localStorage.setItem('sfib_' + k, JSON.stringify(v)) }catch(e){} }
};

/* SamuSignal se (read-only) + is app ka override (agar diya) */
export function settings(){
  const ov = LS.get('ov', {});
  const pick = (k, samuKey) => (ov[k] !== undefined && ov[k] !== '') ? ov[k] : SAMU(samuKey);
  return {
    tdKey: pick('tdKey', 'key') || '',
    fbUrl: pick('fbUrl', 'fbUrl') || DEFAULT_FB,                 /* SamuSignal se na mile to PERSONAL FX / Data Feed wala default */
    fbAuth: pick('fbAuth', 'fbAuth') || '',
    tgTok: pick('tgTok', 'tgTok') || '',
    tgId: pick('tgId', 'tgId') || '',
    gKey: pick('gKey', 'gKey') || '',
    pfxTp: +(SAMU('pfxTp') || 3), pfxGap: +(SAMU('pfxGap') || 5),
    fromSamu: {tdKey: !!SAMU('key'), gKey: !!SAMU('gKey'), fbUrl: !!SAMU('fbUrl'), fbAuth: !!SAMU('fbAuth'), tg: !!(SAMU('tgTok') && SAMU('tgId'))}
  };
}

export function fbBase(s){
  let u = String(s.fbUrl || '').trim().replace(/\/+$/, '');
  if(!u) return '';
  if(!/^https?:\/\//.test(u)) u = 'https://' + u;
  return u;
}
export const fbUrl = (s, path) => { const b = fbBase(s); return b ? b + '/' + path + '.json' + (s.fbAuth ? '?auth=' + encodeURIComponent(s.fbAuth) : '') : '' };

/* ---------------- MT5 feed ---------------- */
const FEED = {meta: null, metaAt: 0, live: null, liveAt: 0, bars: {}};
export async function feedStatus(s, force){
  if(!fbBase(s)) return {ok: false, why: 'Firebase URL nahi'};
  if(force || Date.now() - FEED.metaAt > 15000){
    FEED.metaAt = Date.now();
    try{ const r = await fetch(fbUrl(s, 'feed/meta'), {cache: 'no-store'}); FEED.meta = r.ok ? await r.json() : null }catch(e){ FEED.meta = null }
  }
  const m = FEED.meta;
  const ok = !!(m && m.at && Date.now() - m.at * 1000 < 120000);
  return {ok, meta: m, why: ok ? '' : (m && m.at ? 'feed purana' : 'feed nahi mila')};
}
async function feedLive(s){
  if(FEED.live && Date.now() - FEED.liveAt < 5000) return FEED.live;
  const r = await fetch(fbUrl(s, 'feed/live'), {cache: 'no-store'});
  if(!r.ok) throw new Error('feed live HTTP ' + r.status);
  FEED.live = (await r.json()) || {}; FEED.liveAt = Date.now();
  return FEED.live;
}
async function feedBars(s, sym, tf){
  const k = SPECS[sym].name, ck = tf + '|' + k, c = FEED.bars[ck];
  let str;
  if(c && Date.now() - c.t < (tf === '5min' ? 20000 : 45000)) str = c.s;
  else{
    const r = await fetch(fbUrl(s, 'feed/bars/' + tf + '/' + k), {cache: 'no-store'});
    if(!r.ok) throw new Error('feed bars HTTP ' + r.status);
    str = await r.json();
    if(typeof str !== 'string' || !str) throw new Error('feed me ' + k + ' ' + tf + ' nahi');
    FEED.bars[ck] = {t: Date.now(), s: str};
  }
  const out = str.split(';').map(x => { const v = x.split(',').map(Number); return {t: v[0] * 1000, o: v[1], h: v[2], l: v[3], c: v[4]} }).filter(b => b.c > 0);
  try{ const L = (await feedLive(s))[k], f = L && L.f && L.f[tf];
    if(f && f[0] * 1000 > out[out.length - 1].t) out.push({t: f[0] * 1000, o: f[1], h: f[2], l: f[3], c: f[4]}) }catch(e){}
  return out;
}

/* ---------------- TwelveData ---------------- */
const TD = {cache: {}};
async function tdBars(s, sym, tf, n){
  const ck = sym + '|' + tf, c = TD.cache[ck];
  if(c && Date.now() - c.t < 60000) return c.bars;
  const u = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=${tf}&outputsize=${n}&order=ASC&timezone=UTC&apikey=${encodeURIComponent(s.tdKey)}`;
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if(!j.values) throw new Error('TwelveData: ' + (j.message ? String(j.message).replace(s.tdKey, '***').slice(0, 90) : 'HTTP ' + r.status));
  const bars = j.values.map(v => ({t: Date.parse(v.datetime.replace(' ', 'T') + 'Z'), o: +v.open, h: +v.high, l: +v.low, c: +v.close})).filter(b => isFinite(b.c));
  TD.cache[ck] = {t: Date.now(), bars};
  return bars;
}

/* ek pair ke 1h / 15m / 5m. src: 'mt5' | 'td'. spreadPips: feed se (asli) ya null */
export async function loadPair(s, sym, preferFeed = true){
  const tfs = ['1h', '15min', '5min'];
  if(preferFeed && (await feedStatus(s)).ok){
    try{
      const d = {};
      for(const tf of tfs) d[tf] = await feedBars(s, sym, tf);
      let spreadPips = null;
      try{ const L = (await feedLive(s))[SPECS[sym].name]; if(L && L.sp > 0) spreadPips = L.sp / SPECS[sym].pip }catch(e){}
      return {data: d, src: 'mt5', spreadPips};
    }catch(e){ /* feed me pair nahi -> TwelveData */ }
  }
  if(!s.tdKey) throw Object.assign(new Error('Koi live data source nahi (MT5 feed band, TwelveData key nahi)'), {nodata: true});
  const d = {};
  for(const tf of tfs) d[tf] = await tdBars(s, sym, tf, 300);
  return {data: d, src: 'td', spreadPips: null};
}

/* DEMO data — sirf dikhane ke liye, kabhi live signal nahi */
export function demoPair(sym, now = Date.now()){
  const sp = SPECS[sym], seed = [...sym].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  let x = seed % 97 + 1;
  const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
  const mk = tf => { const ms = TF_MS[tf], n = 300, out = []; let p = sp.quote === 'JPY' ? 150 : 1.1;
    const end = Math.floor(now / ms) * ms;
    for(let i = n; i > 0; i--){ const o = p; p = p * (1 + (rnd() - 0.48) * 0.0015); out.push({t: end - i * ms, o, h: Math.max(o, p) * 1.0003, l: Math.min(o, p) * 0.9997, c: p}) }
    return out };
  return {data: {'1h': mk('1h'), '15min': mk('15min'), '5min': mk('5min')}, src: 'demo', spreadPips: null};
}
