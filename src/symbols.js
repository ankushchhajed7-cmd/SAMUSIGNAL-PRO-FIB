/* Symbols — sirf Forex (Gold / Silver / BTC / crypto bahar).
   Broker symbol = app symbol + suffix (Exness: "m" → AUDCADm). Suffix Settings me badal sakte ho.
   spread = aam spread pips me (andaza, broker ka asli nahi). MT5 feed ho to asli spread wahi se. */

export const FX = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'USD/CAD', 'AUD/USD', 'NZD/USD',
  'EUR/JPY', 'EUR/GBP', 'EUR/CHF', 'EUR/CAD', 'EUR/AUD', 'EUR/NZD',
  'GBP/JPY', 'GBP/CHF', 'GBP/CAD', 'GBP/AUD', 'GBP/NZD',
  'AUD/JPY', 'AUD/CHF', 'AUD/CAD', 'AUD/NZD',
  'NZD/JPY', 'NZD/CHF', 'NZD/CAD',
  'CAD/CHF', 'CAD/JPY', 'CHF/JPY'
];

const SPREAD = {
  'EUR/USD': 1.0, 'GBP/USD': 1.3, 'USD/JPY': 1.3, 'USD/CHF': 1.6, 'USD/CAD': 1.6, 'AUD/USD': 1.3, 'NZD/USD': 1.8,
  'EUR/GBP': 1.6, 'EUR/JPY': 2.0, 'GBP/JPY': 2.6, 'EUR/CHF': 2.0, 'AUD/JPY': 2.0
};

export const SPECS = Object.fromEntries(FX.map(p => {
  const [b, q] = p.split('/');
  const jpy = q === 'JPY';
  return [p, {sym: p, name: b + q, base: b, quote: q, digits: jpy ? 3 : 5, pip: jpy ? 0.01 : 0.0001,
    contract: 100000, spreadPips: SPREAD[p] || 2.4}];
}));

/* Gold / BTC / crypto / index kabhi nahi */
export function isAllowed(sym){
  const n = String(sym || '').toUpperCase().replace('/', '');
  if(/^(XAU|XAG|XPT|XPD|BTC|ETH|LTC|XRP|SOL|BNB|DOGE|ADA|US30|NAS|SPX|GER|UK100)/.test(n)) return false;
  return FX.some(p => p.replace('/', '') === n.slice(0, 6));
}

/* app naam -> broker naam (suffix configurable) */
export function brokerSymbol(sym, suffix){
  return SPECS[sym] ? SPECS[sym].name + (suffix || '') : String(sym);
}

/* broker naam (AUDCADm, AUDCAD.r ...) -> app naam */
export function fromBroker(name){
  const n = String(name || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  return FX.find(p => p.replace('/', '') === n) || null;
}

/* quote currency -> USD (approx rates; live ho to rates object do: {'USD/JPY': 150, ...}) */
export function quoteToUsd(ccy, rates = {}){
  const r = (pair, d) => (rates[pair] > 0 ? rates[pair] : d);
  switch(ccy){
    case 'USD': return 1;
    case 'JPY': return 1 / r('USD/JPY', 150);
    case 'CHF': return 1 / r('USD/CHF', 0.80);
    case 'CAD': return 1 / r('USD/CAD', 1.38);
    case 'GBP': return r('GBP/USD', 1.33);
    case 'EUR': return r('EUR/USD', 1.16);
    case 'AUD': return r('AUD/USD', 0.66);
    case 'NZD': return r('NZD/USD', 0.58);
    default: return 1;
  }
}

/* price distance -> $ (lot) */
export function distToUsd(sym, dist, lot = 0.01, rates){
  const s = SPECS[sym]; if(!s) return 0;
  return Math.abs(dist) * s.contract * lot * quoteToUsd(s.quote, rates);
}
export function usdToDist(sym, usd, lot = 0.01, rates){
  const s = SPECS[sym]; if(!s) return 0;
  return usd / (s.contract * lot * quoteToUsd(s.quote, rates));
}
