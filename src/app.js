/* SamuSignal Pro FIB — UI */
import {analyze, STATES} from './engine.js';
import {FX, SPECS, brokerSymbol, distToUsd} from './symbols.js';
import {settings, LS, loadPair, demoPair, feedStatus} from './data.js';
import {accounts, sendOrder, sendBatch, flipLeg} from './bridge.js';
import {chartAnalyze} from './mtf.js';
import {usdToDist} from './symbols.js';
import * as REC from './records.js';

export const VERSION = '0.2.1';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fmt = (sym, v) => v == null || !isFinite(v) ? '—' : (+v).toFixed(SPECS[sym] ? SPECS[sym].digits : 5);
const t12 = ms => ms ? new Date(ms).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'}) : '—';
const toast = m => { $('scanState').textContent = m };

const CFG = () => Object.assign({h1Mode: 'same', minRR: 1.5, slAtr: 0.3, commissionPips: 0, slippagePips: 0.2}, LS.get('cfg', {}));
const SUFFIX = () => LS.get('suffix', 'm');
const LOT = () => +LS.get('lot', 0.01) || 0.01;

let S = settings(), SRC = '—', RES = {}, CUR = null, busy = false, autoT = null;

/* ---------- data source badge ---------- */
async function refreshSource(){
  S = settings();
  const f = await feedStatus(S, true);
  SRC = f.ok ? 'mt5' : S.tdKey ? 'td' : 'demo';
  const b = $('srcBadge');
  b.className = 'badge ' + SRC;
  b.textContent = SRC === 'mt5' ? '📡 MT5 data' : SRC === 'td' ? 'TwelveData' : 'DEMO DATA';
  $('demoBanner').classList.toggle('hide', SRC !== 'demo');
  $('scanCost').textContent = SRC === 'mt5' ? `${FX.length} pair · MT5 feed — free, turant`
    : SRC === 'td' ? `TwelveData: ${FX.length} pair × 3 = ~${FX.length * 3} credit · 8/min limit ki wajah se ~${Math.ceil(FX.length * 3 / 8)} min`
    : 'Koi live data nahi (MT5 feed band, TwelveData key nahi) — DEMO DATA, live signal band';
  $('autoBtn').disabled = SRC !== 'mt5';
}

/* ---------- scan ---------- */
async function analyzePair(sym){
  let P;
  try{ P = SRC === 'demo' ? demoPair(sym) : await loadPair(S, sym, SRC === 'mt5') }
  catch(e){ if(e.nodata){ P = demoPair(sym) } else return {sym, err: e.message} }
  const r = analyze(P.data, Date.now(), SPECS[sym], CFG(), {spreadPips: P.spreadPips});
  r.sym = sym; r.src = P.src; r.live = P.data['5min'].length ? P.data['5min'][P.data['5min'].length - 1].c : null;
  if(P.src === 'demo'){ r.demo = true; if(r.state === 'CONFIRMED'){ r.state = 'NO SETUP'; r.why = ['DEMO DATA — live signal band'] } }
  if(r.state === 'CONFIRMED') REC.addSignal(r);
  return r;
}
async function scan(){
  if(busy) return; busy = true; $('scanBtn').disabled = true;
  await refreshSource();
  const tdPause = SRC === 'td';
  for(let i = 0; i < FX.length; i++){
    const sym = FX[i];
    toast(`${i + 1}/${FX.length} · ${SPECS[sym].name}…`);
    RES[sym] = await analyzePair(sym);
    renderList();
    if(tdPause && (i + 1) % 2 === 0 && i < FX.length - 1){ toast(`TwelveData limit — 60 sec ruko (${i + 1}/${FX.length})`); await new Promise(r => setTimeout(r, 61000)) }
  }
  const c = Object.values(RES).filter(r => r.state === 'CONFIRMED').length;
  toast(`Ho gaya · ${new Date().toLocaleTimeString()} · CONFIRMED: ${c}`);
  busy = false; $('scanBtn').disabled = false;
  if(CUR) showCard(CUR);
}
const stateCls = s => s === 'CONFIRMED' ? 'st-CONFIRMED' : s.startsWith('WAIT') ? 'st-WAIT' : (s === 'INVALIDATED' || s === 'EXPIRED') ? 'st-' + s : '';
const ORDER = {'CONFIRMED': 0, 'WAIT FOR REJECTION': 1, 'WAIT FOR BREAKOUT RETEST': 2, 'WAIT FOR FIB ZONE': 3, 'EXPIRED': 4, 'INVALIDATED': 5, 'NO SETUP': 6};
function renderList(){
  const rows = Object.values(RES).sort((a, b) => (ORDER[a.state] ?? 9) - (ORDER[b.state] ?? 9));
  $('pairList').innerHTML = rows.map(r => r.err
    ? `<div class="p"><b>${SPECS[r.sym].name}</b><span class="hint" style="margin:0">⚠ ${esc(r.err)}</span></div>`
    : `<div class="p" data-sym="${r.sym}"><b>${SPECS[r.sym].name}</b>${r.dir ? `<span class="${r.dir === 'BUY' ? 'buy' : 'sell'}">${r.dir}</span>` : ''}
        <span class="chip ${stateCls(r.state)}" style="margin-left:auto">${r.state}</span></div>`).join('') || '<p class="hint">—</p>';
  document.querySelectorAll('.p[data-sym]').forEach(el => el.onclick = () => showCard(el.dataset.sym));
}

/* ---------- signal card ---------- */
function showCard(sym){
  CUR = sym; const r = RES[sym], box = $('sigCard'); if(!r) return;
  box.classList.remove('hide');
  const sp = SPECS[sym], ok = r.state === 'CONFIRMED';
  const usd = v => '$' + distToUsd(sym, v, LOT()).toFixed(2);
  box.innerHTML = `
    <div class="row"><h2 style="margin:0">${sp.name} <span class="hint mono">(${esc(brokerSymbol(sym, SUFFIX()))})</span></h2>
      <span class="chip ${stateCls(r.state)}" style="margin-left:auto">${r.state}</span></div>
    ${r.demo ? '<div class="demo-banner" style="margin-top:8px">DEMO DATA — LIVE SIGNALS DISABLED</div>' : ''}
    <p class="hint">Timeframe: 1H trend · 15m setup (Fib) · 5m entry · data ${esc(r.src === 'mt5' ? 'MT5' : r.src === 'td' ? 'TwelveData' : 'DEMO')} · aakhri band 5m candle ${t12(r.dataTime)}</p>
    ${r.dir ? `<p style="margin:8px 0 0;font-size:18px;font-weight:900" class="${r.dir === 'BUY' ? 'buy' : 'sell'}">${r.dir}${r.setup ? ' · ' + (r.setup === 'PULLBACK' ? 'Fib 61.8% pullback' : 'Breakout + retest') : ''}</p>` : ''}
    <div class="kv">
      <div><span>1H / 15m / 5m</span>${esc([r.trends.h1, r.trends.m15, r.trends.m5].map(x => x || '—').join(' / '))}</div>
      <div><span>Fib anchors (15m)</span><span class="mono" style="color:var(--txt);font-size:13px">${r.anchors ? fmt(sym, r.anchors.from) + ' → ' + fmt(sym, r.anchors.to) : '—'}</span></div>
      <div><span>61.8% level</span><b class="mono">${fmt(sym, r.lvl618)}</b></div>
      <div><span>Zone</span><span class="mono">${r.zone ? fmt(sym, r.zone[0]) + ' – ' + fmt(sym, r.zone[1]) : '—'}</span></div>
      ${ok ? `<div><span>Entry (confirmation price)</span><b class="mono">${fmt(sym, r.entry)}</b></div>
      <div><span>Confirmation</span>${t12(r.confirm.t)}</div>
      <div><span>SL</span><b class="mono sell">${fmt(sym, r.sl)}</b> <small>(${usd(r.entry - r.sl)})</small></div>
      <div><span>TP</span><b class="mono buy">${fmt(sym, r.tp)}</b> <small>(${usd(r.tp - r.entry)})</small></div>
      <div><span>R:R (cost ke baad)</span><b>${r.rr.toFixed(2)}</b></div>
      <div><span>Spread + cost</span>${r.costPips.toFixed(1)} pips</div>
      <div><span>Risk (${LOT()} lot)</span>${usd(r.risk)}</div>
      <div><span>Expiry</span>${t12(r.expiresAt)}</div>` : ''}
    </div>
    <div class="why"><b>${ok ? 'Why this signal?' : 'Why no trade?'}</b><br>${r.why.map(esc).join('<br>')}</div>
    ${ok ? `<p class="hint">⚠ PERSONAL FX ko bhejne pe EA apne niyam lagata hai (TP $${S.pfxTp} / +$1 → $0.50 lock / Strategy) — upar wala SL/TP EA pe apne aap nahi lagta. R:R jeet ki guarantee nahi.</p>
      <div class="row" style="margin-top:8px">
        <button class="go" id="mt5Btn" style="flex:1">🚀 MT5 · PERSONAL FX</button>
        <button id="tookBtn">✓ Maine liya</button></div>` : ''}`;
  if(ok){ $('mt5Btn').onclick = () => toMT5(r); $('tookBtn').onclick = () => { REC.addTaken(r, r.live); alert('Records me "Maine liye" me likh diya') } }
  box.scrollIntoView({behavior: 'smooth', block: 'start'});
}
/* demo + real: jo account tick hain (default sab online), har ek ko alag order (acct tag) — SamuSignal jaisa */
async function pickAccts(){
  const acc = await accounts(S), off = LS.get('acctOff', []);
  return {all: acc, use: acc.filter(a => !off.includes(String(a.login)))};
}
async function toMT5(r){
  if(Date.now() > r.expiresAt){ alert('Signal EXPIRED — dobara scan karo'); return }
  const {all, use} = await pickAccts();
  if(all.length && !use.length){ alert('Settings me koi account tick nahi hai'); return }
  const names = use.map(a => `${a.login} (${a.real ? 'REAL' : 'DEMO'})`).join(', ');
  if(!confirm(`${SPECS[r.sym].name} ${r.dir} MARKET → PERSONAL FX\nAccount: ${names || 'har account (bina tag)'}\n\nLot, TP/SL, lock: har EA ke apne niyam.\nBhejein?`)) return;
  const sent = [], fail = [];
  for(const a of (use.length ? use : [null])){
    try{ await sendOrder(S, r, r.live, a ? String(a.login) : undefined); sent.push(a ? a.login : 'sab') }
    catch(e){ fail.push((a ? a.login + ': ' : '') + e.message) }
  }
  if(sent.length) REC.addTaken(r, r.live);
  alert((sent.length ? `Gaya ✅ ${sent.join(', ')}` : '') + (fail.length ? `\n❌ ${fail.join(' | ')}` : ''));
}

/* ---------- 📈 Chart Analysis (Fib LIMIT / STOP) ---------- */
let AN = null;
async function runAnalysis(){
  const sym = $('anPair').value; LS.set('anPair', sym);
  $('anBtn').disabled = true; $('anState').textContent = SPECS[sym].name + ' — data aa raha hai…';
  try{
    await refreshSource();
    if(SRC === 'demo') throw new Error('Live data nahi (MT5 feed band, TwelveData key nahi) — DEMO DATA pe analysis nahi');
    const P = await loadPair(S, sym, SRC === 'mt5');
    AN = chartAnalyze(P.data, Date.now(), sym, {spreadPips: P.spreadPips, tpUsd: S.pfxTp, gapUsd: S.pfxGap});
    AN.src = P.src;
    if(AN.legs.some(L => L.ok)) REC.addFib(AN, false);
    $('anState').textContent = `Ho gaya · ${new Date().toLocaleTimeString()}`;
    renderAn();
  }catch(e){ $('anState').textContent = '⚠ ' + e.message }
  $('anBtn').disabled = false;
}
function renderAn(){
  const r = AN, box = $('anCard'); if(!r) return;
  const sym = r.sym, sp = SPECS[sym], go = r.legs.some(L => L.ok);
  const pips = d => (Math.abs(d) / sp.pip).toFixed(1), eta = m => m == null ? '—' : m < 60 ? `~${m} min` : `~${(m / 60).toFixed(1)} ghanta`;
  box.classList.remove('hide');
  box.innerHTML = `
    <div class="row"><h2 style="margin:0">${sp.name} <span class="hint mono">(${esc(brokerSymbol(sym, SUFFIX()))})</span></h2>
      <span class="chip ${go ? 'st-CONFIRMED' : ''}" style="margin-left:auto">${go ? (r.mode === 'UP' ? '↑ BUY' : '↓ SELL') + ' · ORDER' : '⏸ NO TRADE'}</span></div>
    <p class="hint">data ${r.src === 'mt5' ? '📡 MT5' : 'TwelveData'} · aakhri band 5m candle ${t12(r.dataTime)} · live <b class="mono">${fmt(sym, r.live)}</b></p>
    <div class="kv">
      <div><span>1H / 15m / 5m</span>${esc([r.trends.h1, r.trends.m15, r.trends.m5].join(' / '))}</div>
      <div><span>15m ADX</span>${r.trends.adx15}</div>
      ${r.leg ? `<div><span>Fib anchors (15m)</span><span class="mono">${fmt(sym, r.leg.start.px)} → ${fmt(sym, r.leg.end.px)}</span></div>
      <div><span>61.8% level</span><b class="mono">${fmt(sym, r.leg.lvl618)}</b></div>` : ''}
      ${go ? `<div><span>+$1 (0.01 lot) andaza</span>${eta(r.eta)}</div><div><span>Pending expiry</span>60 min</div>` : ''}
    </div>
    ${r.legs.map(L => `<div style="border:1px ${L.ok ? 'solid' : 'dashed'} ${L.ok ? (L.dir === 'BUY' ? 'var(--up)' : 'var(--dn)') : 'var(--line)'};border-radius:10px;padding:9px 11px;margin-top:8px;${L.ok ? '' : 'opacity:.6'}">
        <div class="row"><b class="${L.dir === 'BUY' ? 'buy' : 'sell'}" style="${L.ok ? '' : 'text-decoration:line-through'}">${L.dir} ${L.kind}</b><b class="mono" style="margin-left:auto">${fmt(sym, L.entry)}</b></div>
        <p class="hint" style="margin:4px 0 0">${esc(L.why)} · live se ${pips(L.entry - r.live)} pips ${L.entry > r.live ? 'upar' : 'neeche'} ($${distToUsd(sym, L.entry - r.live, 0.01).toFixed(2)} / 0.01)${L.ok ? '' : ' · ✗ ' + esc(L.bad)}</p></div>`).join('')}
    <div class="why"><b>${go ? 'Kyun?' : 'Why no trade?'}</b><br>${r.why.map(esc).join('<br>')}</div>
    ${go ? `<p class="hint">🔗 Dono order ek batch — jo pehle bhare, PERSONAL FX baaki cancel karega · 60 min me na bhare to hat jayega · lot / TP / SL / lock: EA ke apne niyam. Backtest: Level Engine jaisa, thoda kam DD, saabit fayda nahi — pehle demo.</p>
      <div class="row" style="margin-top:8px"><button class="go" id="anSend" style="flex:1">🚀 PERSONAL FX ko bhejo</button><button id="anTook">✓ Maine liya</button></div>
      <button id="anRev" style="width:100%;margin-top:8px;border-color:var(--dn);color:#ffb3b3">🔄 ULTA bhejo — ${r.legs.filter(L => L.ok).map(L => { const f = flipLeg(L); return f.dir + ' ' + f.kind }).join(' + ')} (usi bhaav pe)</button>` : ''}`;
  if(go){ $('anSend').onclick = () => sendAn(false); $('anRev').onclick = () => sendAn(true); $('anTook').onclick = () => { REC.addFib(AN, true); alert('Records me likh diya') } }
}
async function sendAn(rev){
  const r = AN; if(!r) return;
  if(Date.now() - r.dataTime > 15 * 60000){ alert('Analysis purana — dobara AUTO ANALYZE karo'); return }
  const {all, use} = await pickAccts();
  if(all.length && !use.length){ alert('Settings me koi account tick nahi hai'); return }
  const legs = r.legs.filter(L => L.ok).map(L => rev ? flipLeg(L) : L);
  const names = use.map(a => `${a.login} (${a.real ? 'REAL' : 'DEMO'})`).join(', ');
  if(!confirm((rev ? '🔄 ULTA ORDER — analysis ke ulta, usi bhaav pe\n⚠ Backtest (naya-trend niyam): ulta = nuksaan (~−$0.10/trade)\n\n' : '') + `${SPECS[r.sym].name} · ${legs.map(L => `${L.dir} ${L.kind} @ ${fmt(r.sym, L.entry)}`).join(' + ')}\nAccount: ${names || 'har account (bina tag)'}\n\nJo pehle bhare, doosra cancel · 60 min expiry · lot/TP/SL/lock: EA ke niyam.\nBhejein?`)) return;
  const ok = [], fail = [];
  for(const a of (use.length ? use : [null])){
    try{ await sendBatch(S, r, a ? String(a.login) : undefined, rev); ok.push(a ? a.login : 'sab') }
    catch(e){ fail.push((a ? a.login + ': ' : '') + e.message) }
  }
  if(ok.length) REC.addFib(r, true, rev);
  alert((ok.length ? `Gaya ✅ ${ok.join(', ')}` : '') + (fail.length ? `\n❌ ${fail.join(' | ')}` : ''));
}

/* ---------- records ---------- */
function recTable(k){
  const a = REC.list(k), st = REC.stats(a);
  const head = `<p class="hint">Kul ${a.length} · nateeja aaya ${st.n}${st.n ? ` · jeet ${(st.win * 100).toFixed(0)}% · expectancy ${st.exp.toFixed(2)}R · PF ${st.pf === Infinity ? '∞' : st.pf ? st.pf.toFixed(2) : '—'} · max DD ${st.maxDD.toFixed(1)}R` : ''}</p>
    ${st.enough ? '' : `<p class="hint" style="color:var(--warn)">Not enough data for a reliable conclusion (${st.n}/${REC.MIN_N}).</p>`}`;
  return head + (a.length ? `<table><tr><th>Waqt</th><th>Pair</th><th>Disha</th><th>Setup</th><th>Nateeja</th></tr>${a.slice(0, 40).map(r =>
    `<tr><td>${t12(r.at)}</td><td>${SPECS[r.sym] ? SPECS[r.sym].name : esc(r.sym)}</td><td class="${r.dir === 'BUY' ? 'buy' : 'sell'}">${r.dir}</td><td>${r.setup}</td><td>${r.res ? (r.res.R > 0 ? '✓ ' : '✗ ') + r.res.R.toFixed(2) + 'R' : '…'}</td></tr>`).join('')}</table>` : '');
}
function fibTable(){
  const a = REC.list('fib'), done = a.filter(r => r.res && r.res.r !== 'NOFILL'), nf = a.filter(r => r.res && r.res.r === 'NOFILL').length;
  const sum = done.reduce((s, r) => s + r.res.usd, 0), w = done.filter(r => r.res.usd > 0).length;
  const part = k => { const x = done.filter(r => k ? r.sent : !r.sent); return x.length ? `${x.length} · jeet ${Math.round(x.filter(r => r.res.usd > 0).length / x.length * 100)}% · $${(x.reduce((s, r) => s + r.res.usd, 0) / x.length).toFixed(2)}/trade` : '—' };
  return `<p class="hint">Kul ${a.length} · bhare + nateeja ${done.length} · bhara nahi ${nf}${done.length ? ` · jeet ${Math.round(w / done.length * 100)}% · kul $${sum.toFixed(2)} (0.01 lot)` : ''}</p>
    <p class="hint">Sirf analysis (bheja nahi): ${part(false)} · Bheja / maine liya: ${part(true)}</p>
    ${done.length >= REC.MIN_N ? '' : `<p class="hint" style="color:var(--warn)">Not enough data for a reliable conclusion (${done.length}/${REC.MIN_N}).</p>`}
    ${a.length ? `<table><tr><th>Waqt</th><th>Pair</th><th>Order</th><th>Nateeja</th></tr>${a.slice(0, 40).map(r => `<tr><td>${t12(r.at)}${r.sent ? (r.rev ? ' 🔄' : ' 🚀') : ''}</td><td>${SPECS[r.sym] ? SPECS[r.sym].name : esc(r.sym)}</td><td>${r.legs.map(L => L.dir[0] + (L.kind === 'LIMIT' ? 'L' : 'S')).join('+')}</td><td>${r.res ? (r.res.r === 'NOFILL' ? 'bhara nahi' : (r.res.usd > 0 ? '✓ $' : '✗ $') + r.res.usd.toFixed(2) + ' ' + r.res.r) : '…'}</td></tr>`).join('')}</table>` : ''}`;
}
function renderRec(){ $('recFib').innerHTML = fibTable(); $('recSig').innerHTML = recTable('sig'); $('recTaken').innerHTML = recTable('taken') }
async function settleAll(){
  await refreshSource();
  if(SRC === 'demo'){ alert('Live data nahi — nateeja check nahi ho sakta'); return }
  for(const k of ['sig', 'taken']){
    const a = REC.list(k);
    for(const r of a.filter(x => !x.res).slice(0, 10)){
      try{ const P = await loadPair(S, r.sym, SRC === 'mt5'); const done = P.data['5min'].filter(b => b.t + 300e3 <= Date.now()); r.res = REC.settle(r, done) }catch(e){}
    }
    LS.set(k === 'taken' ? 'recTaken' : 'recSig', a);
  }
  const f = REC.list('fib');
  for(const r of f.filter(x => !x.res).slice(0, 10)){
    try{ const P = await loadPair(S, r.sym, SRC === 'mt5'); const done = P.data['5min'].filter(b => b.t + 300e3 <= Date.now());
      r.res = REC.settleFib(r, done, usdToDist(r.sym, 1, 0.01), (P.spreadPips != null ? P.spreadPips : SPECS[r.sym].spreadPips) * SPECS[r.sym].pip) }catch(e){}
  }
  LS.set('recFib', f);
  renderRec();
}

/* ---------- backtest ---------- */
async function renderBt(){
  try{
    const d = await (await fetch('backtest/latest.json', {cache: 'no-store'})).json();
    const m = x => x && x.n ? `${x.n} trade · jeet ${x.win}% · expectancy ${x.expR}R · PF ${x.pf ?? '—'} · max DD ${x.maxDD_R}R · avg ulta ${x.avgMAE_R}R / seedha ${x.avgMFE_R}R · cost ${x.avgCostPips} pips${x.reliable === 'yes' ? '' : ' · <b style="color:var(--warn)">' + x.reliable + '</b>'}` : '—';
    $('btBox').innerHTML = `<p class="hint">Data: ${d.period.map(x => x.slice(0, 10)).join(' → ')} · ${d.pairs} pair · split ${d.split.slice(0, 10)} · ${d.orderType}</p>
      <p><b>In-sample:</b> ${m(d.inSample)}</p><p><b>Out-of-sample:</b> ${m(d.outOfSample)}</p>
      <table><tr><th>OOS setup</th><th>n</th><th>jeet</th><th>exp R</th></tr>${Object.entries(d.oosBySetup).map(([k, v]) => `<tr><td>${k}</td><td>${v.n}</td><td>${v.win}%</td><td>${v.expR}</td></tr>`).join('')}</table>
      <table style="margin-top:8px"><tr><th>OOS session</th><th>n</th><th>jeet</th><th>exp R</th></tr>${Object.entries(d.oosBySession).map(([k, v]) => `<tr><td>${k}</td><td>${v.n}</td><td>${v.win}%</td><td>${v.expR}</td></tr>`).join('')}</table>
      ${d.ea ? `<p class="hint" style="margin-top:10px"><b>PERSONAL FX Strategy 2 niyam pe</b> (−$3 SL / $3 TP / +$1 → $0.50 lock, 0.01 lot): ${esc(d.ea)}</p>` : ''}
      <div class="why"><b>Imaandaar nateeja:</b> ${esc(d.verdict || '')}</div>`;
  }catch(e){ $('btBox').innerHTML = '<p class="hint">Backtest file nahi mili.</p>' }
}

/* ---------- settings ---------- */
async function renderSet(){
  S = settings();
  const f = S.fromSamu, y = v => v ? '✅' : '—';
  $('importBox').innerHTML = `TwelveData key ${y(f.tdKey)} · Gemini key ${y(f.gKey)} · Firebase URL ${f.fbUrl ? '✅' : '✅ (default)'} · Firebase auth ${y(f.fbAuth)} · Telegram ${y(f.tg)}`;
  const ov = LS.get('ov', {}); $('ovTd').value = ov.tdKey || ''; $('ovFb').value = ov.fbUrl || ''; $('ovAuth').value = ov.fbAuth || '';
  const c = CFG(); $('sSuffix').value = SUFFIX(); $('sH1').value = c.h1Mode; $('sRR').value = c.minRR; $('sSlAtr').value = c.slAtr; $('sLot').value = LOT(); $('sCom').value = c.commissionPips; $('sSlip').value = c.slippagePips;
  const acc = await accounts(S), off = LS.get('acctOff', []);
  $('sAccts').innerHTML = acc.length ? acc.map(a => `<label style="display:flex;gap:8px;align-items:center;font-size:14px;color:var(--txt)"><input type="checkbox" style="width:auto" data-acct="${esc(a.login)}" ${off.includes(String(a.login)) ? '' : 'checked'}>
      <b class="${a.real ? 'sell' : 'buy'}">${a.real ? 'REAL' : 'DEMO'}</b> ${esc(a.login)} · $${(+a.bal || 0).toFixed(0)}</label>`).join('') : 'Koi account online nahi — order bina tag jayega (EA ki AppAcceptUntagged setting pe).';
  document.querySelectorAll('[data-acct]').forEach(el => el.onchange = () => {
    const o = new Set(LS.get('acctOff', [])); el.checked ? o.delete(el.dataset.acct) : o.add(el.dataset.acct); LS.set('acctOff', [...o]) });
  $('eaBox').innerHTML = acc.length ? `PERSONAL FX chalu: ${acc.length} account. EA ke niyam (TP / lock / Strategy) EA heartbeat me nahi aate — <b>app inhe verify nahi kar sakta</b>; SamuSignal setting: TP $${S.pfxTp}, gap $${S.pfxGap}.` : 'Koi PERSONAL FX account abhi online nahi dikha (heartbeat 5 min ke andar nahi).';
}
function saveSet(){
  LS.set('ov', {tdKey: $('ovTd').value.trim(), fbUrl: $('ovFb').value.trim(), fbAuth: $('ovAuth').value.trim()});
  LS.set('suffix', $('sSuffix').value.trim());
  LS.set('cfg', {h1Mode: $('sH1').value, minRR: Math.max(0.5, +$('sRR').value || 1.5), slAtr: Math.max(0, +$('sSlAtr').value || 0.3),
    commissionPips: Math.max(0, +$('sCom').value || 0), slippagePips: Math.max(0, +$('sSlip').value || 0)});
  LS.set('lot', Math.max(0.01, +$('sLot').value || 0.01));
  refreshSource(); alert('Save ho gaya');
}

/* ---------- nav ---------- */
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  ['An', 'Scan', 'Rec', 'Bt', 'Set'].forEach(p => $('pg' + p).classList.toggle('hide', p !== b.dataset.pg));
  if(b.dataset.pg === 'Rec') renderRec();
  if(b.dataset.pg === 'Bt') renderBt();
  if(b.dataset.pg === 'Set') renderSet();
});
$('scanBtn').onclick = scan;
$('anPair').innerHTML = FX.map(p => `<option value="${p}">${SPECS[p].name}</option>`).join('');
$('anPair').value = LS.get('anPair', 'GBP/USD');
$('anBtn').onclick = runAnalysis;
$('settleBtn').onclick = settleAll;
$('saveBtn').onclick = saveSet;
$('autoBtn').onclick = () => {
  if(autoT){ clearInterval(autoT); autoT = null; $('autoBtn').textContent = '⟳ Auto: OFF'; return }
  autoT = setInterval(() => { if(!document.hidden && SRC === 'mt5') scan() }, 5 * 60000);
  $('autoBtn').textContent = '⟳ Auto: 5 min'; scan();
};
/* ⟳ = naya version (service worker update + cache saaf) + data source dobara */
$('verTag').textContent = 'v' + VERSION;
$('refBtn').onclick = async () => {
  $('refBtn').disabled = true; $('refBtn').textContent = '…';
  try{
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if(reg) await reg.update();
    if(window.caches) for(const k of await caches.keys()) await caches.delete(k);
  }catch(e){}
  location.reload();
};
refreshSource();
export {STATES};
