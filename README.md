# SamuSignal Pro FIB

Fibonacci **61.8% retracement** signal app, sirf **Forex** (Gold / Silver / BTC / crypto nahi).
**Sirf signal + seekhna.** Koi accuracy ya profit guarantee nahi. Setup saaf na ho to `NO TRADE / WAIT` dikhta hai.

## Kaise chalta hai
- **Data:** pehle **MT5 Data Feed** (Firebase `/feed`, broker ka exact bhaav). Wo na ho to **TwelveData**. Dono na hon to
  **DEMO DATA — LIVE SIGNALS DISABLED** (demo data kabhi live signal nahi banta).
- **Settings:** SamuSignal (same site `ankushchhajed7-cmd.github.io`) ki TwelveData key, Gemini key, Firebase URL/auth, Telegram
  **apne aap padhta hai, kabhi likhta nahi**. Keys code / repo / screen / log me kahin nahi.
- **Niyam** (`src/engine.js`):
  1. Sirf **band (completed) candles**. Pivot sirf `k` candle baad pakka (non-repainting, lookahead nahi).
  2. **1H** mukhya trend, **15m** setup (Fib leg), **5m** entry confirmation. 1H/15m ulte ya 15m range = NO TRADE.
  3. Uptrend: swing LOW → HIGH, 61.8% pe sirf BUY. Downtrend: swing HIGH → LOW, 61.8% pe sirf SELL.
  4. Zone chhoona = `WAIT FOR REJECTION`. Band hui rejection candle = `CONFIRMED`. Andha LIMIT/STOP nahi.
  5. Breakout alag: 5m **close** swing ke paar → `WAIT FOR BREAKOUT RETEST` → retest + hold = `CONFIRMED`.
  6. Target tak jagah (na tute resistance/support) + spread/commission/slippage ke baad **R:R** = hard filter.
  7. SL = invalidation (78.6% / retest) ke paar + ATR buffer. Entry, SL, TP, R:R, $ risk dikhte hain.
  8. States: `NO SETUP · WAIT FOR FIB ZONE · WAIT FOR REJECTION · WAIT FOR BREAKOUT RETEST · CONFIRMED · INVALIDATED · EXPIRED`.
- **🚀 MT5 · PERSONAL FX:** CONFIRMED signal pe button + confirm → order seedha PERSONAL FX (SamuSignal wala Firebase
  `/personalfx/orders`), Settings me tick kiye **demo + real** accounts me (default dono). App khud kabhi order nahi bhejta.
  EA ke niyam (TP $3, +$1 → $0.50 lock, Strategy 1/2) **EA ke apne** — app inhe badalta nahi aur verify bhi nahi kar sakta
  (EA heartbeat me ye niyam nahi aate). Signal ka SL/TP EA pe apne aap nahi lagta.
- **Records:** "Signal bane" aur "Maine liye" **alag**, nateeje kabhi mile-jule nahi. 30 se kam = "Not enough data".

## Tests
`npm test` (Node 20+) — 20 tests: incomplete candle, non-repainting pivot, Fib direction (up/down), touch ≠ signal,
BUY/SELL rejection, wick ≠ breakout, close + retest, 1H/15m conflict, spread/room reject, expiry, invalidation, stale data, lookahead.

## Backtest (imaandaar)
`node tools/backtest.mjs <dataDir>` — har 5m candle pe sirf us waqt tak ka data, confirmation ke baad agli candle ke open pe
MARKET entry (+ spread + slippage), ek candle me SL aur TP dono = SL. Samay se split (60% in-sample / 40% out-of-sample).
Nateeja: `backtest/latest.json` (app ke 🧪 tab me).

Pehla run (12 pair, 19 Sep – 23 Oct 2026, TwelveData data):

| | Trade | Jeet | Expectancy | PF |
|---|---|---|---|---|
| In-sample | 32 | 12.5% | −0.64R | 0.26 |
| Out-of-sample | 33 | 27.3% | +0.06R | 1.08 |
| PERSONAL FX Strategy 2 niyam pe (IS / OOS) | 32 / 33 | 66% / 67% | −$0.40 / −$0.39 per trade (0.01 lot) | — |

**Abhi koi saabit edge nahi.** Sample chhota (~5 hafte). Koi performance improvement ka daava nahi.

## Deploy
GitHub → Settings → Pages → Branch `main` / root → `https://ankushchhajed7-cmd.github.io/SAMUSIGNAL-PRO-FIB/`
