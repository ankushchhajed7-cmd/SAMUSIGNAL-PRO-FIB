/* PERSONAL FX bridge — SamuSignal wala hi raasta: Firebase /personalfx/orders -> PERSONAL FX EA (MT5).
   App KHUD kabhi order nahi bhejta (koi auto-trading nahi). Sirf user ke "🚀 MT5" button + confirm pe —
   koi setting badalni nahi padti (user ki maang).
   EA ke niyam (TP $3 / +$1 -> $0.50 lock / Strategy 1-2 / grid) EA ke apne hain — ye app unhe
   badalta nahi, aur signal ka SL/TP EA pe apne aap lagu NAHI hota. EA heartbeat me ye niyam nahi
   aate, isliye app unhe "verify" nahi kar sakta — sirf SamuSignal ki settings dikhata hai. */
import {SPECS} from './symbols.js';
import {fbUrl} from './data.js';


/* Order apni key se (POST ki random key nahi): key me kism, jo EA MT5 comment ("PFXA"+key) me likhta hai aur
   Watcher GitHub pe le jaata hai — har trade ka record pehchaan me. -FN Fib LIMIT/STOP · -FU ULTA · -FA ABHI · -FC Confirm. */
export function orderKey(tag, now = Date.now()){
  const r = Array.from(crypto.getRandomValues(new Uint8Array(9)), x => (x % 36).toString(36)).join('');
  return ('-F' + tag + now.toString(36) + r).slice(0, 20);
}
const put = (s, tag, body) => fetch(fbUrl(s, 'personalfx/orders/' + orderKey(tag)), {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});

export async function accounts(s){
  const u = fbUrl(s, 'personalfx/accounts'); if(!u) return [];
  try{ const r = await fetch(u, {cache: 'no-store'}); const j = r.ok ? await r.json() : null;
    return Object.values(j || {}).filter(a => a && a.login && Date.now() - (+a.at || 0) < 5 * 60000) }catch(e){ return [] }
}

/* CONFIRMED signal -> MARKET order (confirmation ke baad; andha LIMIT/STOP nahi) */
export async function sendOrder(s, sig, live, acct){
  if(!sig || sig.state !== 'CONFIRMED') throw new Error('Sirf CONFIRMED signal bhej sakte hain');
  if(Date.now() > sig.expiresAt) throw new Error('Signal EXPIRED');
  const sp = SPECS[sig.sym], now = Date.now();
  const body = {id: now, pair: sp.name, type: sig.dir + 'MARKET', entry: +(+live).toFixed(sp.digits), live: +(+live).toFixed(sp.digits),
    at: now, exp: 5, status: 'NEW', src: 'SamuSignal Pro FIB', batch: 'F' + now.toString(36), leg: 1, legs: 1};
  if(acct) body.acct = acct;
  const r = await put(s, 'C', body);
  if(!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Firebase ne mana kiya (auth)' : 'HTTP ' + r.status);
  return body;
}

/* ⚡ ABHI ENTRY — Chart Analysis ki disha me turant MARKET (LIMIT/STOP ka intezaar nahi). EA broker ke bhaav pe bharta hai. */
export const mktDir = plan => { const g = plan.legs.filter(L => L.ok); return g.length && g.every(L => L.dir === g[0].dir) ? g[0].dir : '' };
export async function sendMarket(s, plan, acct){
  const dir = mktDir(plan); if(!dir) throw new Error('Disha pakki nahi (RANGE)');
  const sp = SPECS[plan.sym], now = Date.now();
  const body = {id: now, pair: sp.name, type: dir + 'MARKET', entry: 0, live: +(+plan.live).toFixed(sp.digits),
    at: now, exp: 60, status: 'NEW', src: 'SamuSignal Pro FIB ABHI', batch: 'F' + now.toString(36), leg: 1, legs: 1};
  if(acct) body.acct = acct;
  const r = await put(s, 'A', body);
  if(!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Firebase ne mana kiya (auth)' : 'HTTP ' + r.status);
  return body;
}

/* 📈 Chart Analysis ka batch (Fib LIMIT + STOP) -> PERSONAL FX. SamuSignal jaisa: ek "batch", jo pehle
   bhare EA baaki cancel karta hai (AppBatchOCO). 60 min me na bhare to EA hata deta hai. */
/* ULTA: usi bhaav pe ulti disha — BUY LIMIT -> SELL STOP, BUY STOP -> SELL LIMIT (aur ulta) */
export const flipLeg = L => Object.assign({}, L, {dir: L.dir === 'BUY' ? 'SELL' : 'BUY', kind: L.kind === 'LIMIT' ? 'STOP' : 'LIMIT'});
export async function sendBatch(s, plan, acct, rev){
  const sp = SPECS[plan.sym], legs = plan.legs.filter(L => L.ok).map(L => rev ? flipLeg(L) : L), now = Date.now(), batch = 'F' + now.toString(36);
  if(!legs.length) throw new Error('Koi order nahi');
  const sent = [];
  for(let k = 0; k < legs.length; k++){
    const L = legs[k];
    const body = {id: now + k, pair: sp.name, type: L.dir + L.kind, entry: +(+L.entry).toFixed(sp.digits), live: +(+plan.live).toFixed(sp.digits),
      at: now, exp: 60, status: 'NEW', src: 'SamuSignal Pro FIB' + (rev ? ' ULTA' : ''), batch, leg: k + 1, legs: legs.length};
    if(acct) body.acct = acct;
    const r = await put(s, rev ? 'U' : 'N', body);
    if(!r.ok) throw new Error((sent.length ? `${sent.length} gaya, baaki fail — ` : '') + (r.status === 401 || r.status === 403 ? 'Firebase ne mana kiya (auth)' : 'HTTP ' + r.status));
    sent.push(body);
  }
  return sent;
}
