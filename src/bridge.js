/* PERSONAL FX bridge — SamuSignal wala hi raasta: Firebase /personalfx/orders -> PERSONAL FX EA (MT5).
   App KHUD kabhi order nahi bhejta (koi auto-trading nahi). Sirf user ke "🚀 MT5" button + confirm pe —
   koi setting badalni nahi padti (user ki maang).
   EA ke niyam (TP $3 / +$1 -> $0.50 lock / Strategy 1-2 / grid) EA ke apne hain — ye app unhe
   badalta nahi, aur signal ka SL/TP EA pe apne aap lagu NAHI hota. EA heartbeat me ye niyam nahi
   aate, isliye app unhe "verify" nahi kar sakta — sirf SamuSignal ki settings dikhata hai. */
import {SPECS} from './symbols.js';
import {fbUrl} from './data.js';


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
  const r = await fetch(fbUrl(s, 'personalfx/orders'), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  if(!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Firebase ne mana kiya (auth)' : 'HTTP ' + r.status);
  return body;
}

/* 📈 Chart Analysis ka batch (Fib LIMIT + STOP) -> PERSONAL FX. SamuSignal jaisa: ek "batch", jo pehle
   bhare EA baaki cancel karta hai (AppBatchOCO). 60 min me na bhare to EA hata deta hai. */
export async function sendBatch(s, plan, acct){
  const sp = SPECS[plan.sym], legs = plan.legs.filter(L => L.ok), now = Date.now(), batch = 'F' + now.toString(36);
  if(!legs.length) throw new Error('Koi order nahi');
  const sent = [];
  for(let k = 0; k < legs.length; k++){
    const L = legs[k];
    const body = {id: now + k, pair: sp.name, type: L.dir + L.kind, entry: +(+L.entry).toFixed(sp.digits), live: +(+plan.live).toFixed(sp.digits),
      at: now, exp: 60, status: 'NEW', src: 'SamuSignal Pro FIB', batch, leg: k + 1, legs: legs.length};
    if(acct) body.acct = acct;
    const r = await fetch(fbUrl(s, 'personalfx/orders'), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    if(!r.ok) throw new Error((sent.length ? `${sent.length} gaya, baaki fail — ` : '') + (r.status === 401 || r.status === 403 ? 'Firebase ne mana kiya (auth)' : 'HTTP ' + r.status));
    sent.push(body);
  }
  return sent;
}
