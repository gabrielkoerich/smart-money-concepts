# smart-money-concepts

A TypeScript implementation of Smart Money Concepts (SMC) and the ICT methodology for market structure analysis. It detects order blocks, fair value gaps, breaks of structure, changes of character and liquidity grabs.

It has no runtime dependencies. You feed it OHLCV candles and it returns structured market analysis.

## Installation

```bash
npm install smart-money-concepts
bun add smart-money-concepts
```

## Quick start

```typescript
import { SmartMoneyConcepts } from 'smart-money-concepts'

const smc = new SmartMoneyConcepts({
  swingsLengthInput: 50,
})

// Feed candles one at a time
const alerts = smc.update(high, low, open, close, timestamp, volume)

// Check what happened
if (alerts.swingBullishBOS) {
  console.log('Bullish Break of Structure detected')
}

if (alerts.swingBearishCHoCH) {
  console.log('Bearish Change of Character detected')
}

// Get current market state
const bias = smc.getTrendBias()       // 'Bullish' | 'Bearish' | 'Neutral'
const zone = smc.getCurrentZone()      // 'Premium' | 'Discount' | 'Equilibrium'
const obs  = smc.getOrderBlocks()      // { swing: OrderBlock[], internal: OrderBlock[] }
```

## Bulk processing for backtests

```typescript
const candles = [
  { time: 1700000000, open: 100, high: 105, low: 98, close: 103, volume: 1000 },
  { time: 1700000060, open: 103, high: 108, low: 101, close: 106, volume: 1200 },
  // ...
]

const allAlerts = smc.updateBulk(candles)
// Returns an Alerts object for each candle
```

## Real-time updates

With live data, a candle with the same timestamp updates the current bar:

```typescript
// New bar
smc.update(105, 100, 102, 104, 1700000000, 500)

// Same timestamp = updates the current bar in place (efficient)
smc.update(107, 100, 102, 106, 1700000000, 800)

// New timestamp = new bar
smc.update(108, 103, 106, 107, 1700000060, 600)
```

## API reference

### Constructor

```typescript
new SmartMoneyConcepts(config?: SmartMoneyConceptsConfig)
```

### Core methods

| Method | Returns | Description |
|--------|---------|-------------|
| `update(high, low, open, close, time, volume?)` | `Alerts` | Process a new candle. Auto-detects updates to current bar. |
| `updateLastBar(high, low, open, close, time, volume?)` | `Alerts` | Explicitly update the last bar in place. |
| `updateBulk(candles)` | `Alerts[]` | Process an array of candles at once. |
| `clearAllData()` | `void` | Reset all internal state. |

### Market state

| Method | Returns | Description |
|--------|---------|-------------|
| `getTrendBias()` | `TrendBias` | Swing trend direction: `'Bullish'`, `'Bearish'`, or `'Neutral'` |
| `getInternalBias()` | `TrendBias` | Internal (shorter-term) trend direction |
| `getCurrentZone(price?)` | `Zone` | Price zone: `'Premium'`, `'Discount'`, or `'Equilibrium'` |
| `getOrderBlocks()` | `{ swing, internal }` | Active order blocks at both structure levels |
| `getMarketMakerAnalysis()` | `MarketMakerAnalysis` | Wyckoff phase detection with confidence scoring |
| `getOrderFlowSignals(limit?)` | `OrderFlowSignal[]` | Recent institutional activity signals |
| `getLiquidityGrabs(limit?)` | `LiquidityGrab[]` | Recent liquidity grab events |
| `getConsecutiveCandles()` | `object` | Consecutive bullish/bearish candle count |

### Debugging

| Method | Returns | Description |
|--------|---------|-------------|
| `getAlerts()` | `Alerts` | Current bar's alerts (same as `update()` return value) |
| `getDebugInfo(price?)` | `object` | Snapshot of the market state |
| `getPerformanceStats()` | `object` | Processing time metrics |
| `getMemoryStats()` | `object` | Internal array sizes |
| `getConfiguration()` | `object` | Current config values |
| `getCurrentZoneTraillings()` | `object` | Zone threshold levels |

### Alerts object

Every call to `update()` returns an `Alerts` object with these boolean flags:

#### Structure
- `swingBullishBOS` / `swingBearishBOS`: Swing Break of Structure
- `swingBullishCHoCH` / `swingBearishCHoCH`: Swing Change of Character
- `internalBullishBOS` / `internalBearishBOS`: Internal Break of Structure
- `internalBullishCHoCH` / `internalBearishCHoCH`: Internal Change of Character

#### Order blocks
- `swingBullishObBrokenDown` / `swingBearishObBrokenUp`: Swing OB mitigation
- `internalBullishObBrokenDown` / `internalBearishObBrokenUp`: Internal OB mitigation
- `insideInternalBullishOrderBlock` / `insideSwingBullishOrderBlock`: Price inside bullish OB
- `insideInternalBearishOrderBlock` / `insideSwingBearishOrderBlock`: Price inside bearish OB

#### Other
- `equalHighs` / `equalLows`: Equal highs/lows (liquidity pools)
- `bullishFairValueGap` / `bearishFairValueGap`: FVG detection
- `liquidityGrab`: Liquidity grab at equal levels
- `volumeSpike` / `institutionalVolume`: Volume events
- `sessionBreakout`: Session breakout detection
- `changeOfStateOfDelivery`: ICT COSD
- `breakerBlockFormed`: HP OB failed, became breaker
- `unicornSetup`: Breaker + FVG alignment (The Unicorn)

Use `alerts.getTrueAlerts()` to get only the active alerts as an object.

## Configuration

```typescript
const smc = new SmartMoneyConcepts({
  // Structure detection
  swingsLengthInput: 50,           // Bars to confirm swing pivots (default: 50)
  equalHighsLowsLengthInput: 3,   // Bars to confirm equal highs/lows
  equalHighsLowsThresholdInput: 0.1, // Sensitivity (0-0.5)

  // Order blocks
  internalOrderBlocksSizeInput: 5, // Max internal OBs to track
  swingOrderBlocksSizeInput: 5,    // Max swing OBs to track
  orderBlockFilterInput: 'Atr',    // 'Atr' | 'Cumulative Mean Range'
  orderBlockMitigationInput: 'Close', // 'Close' | 'High/Low'

  // Volume
  volumeThresholdInput: 1.2,       // Volume spike threshold (multiplier)
  requireVolumeConfirmation: false, // Require volume for signals

  // ICT methodology
  onlyTradeFreshOBs: true,         // Only fresh (unmitigated) order blocks
  maxOBMitigations: 1,             // Max times an OB can be traded
  enableCOSD: true,                // Change of State of Delivery
  classifyOrderBlocks: true,       // HP vs Continuation OB classification

  // Advanced OB validation
  strict5CriteriaValidation: false, // All 5 ICT criteria for HP OBs
  requireFVGForHP: false,          // Require FVG for HP OBs
  requireCOSDForHP: false,         // Require COSD for HP OBs

  // ATR-based OB size filtering
  enableOBSizeFilter: false,
  minOBSizeATRMultiplier: 0.3,
  maxOBSizeATRMultiplier: 2.0,

  // ATR period
  atrPeriod: 200,                  // ATR calculation period
})
```

## Custom logger

Debug output is off by default. To see it, pass your own logger:

```typescript
import { setLogger } from 'smart-money-concepts'

setLogger({
  debug: (msg, ...args) => console.debug(msg, ...args),
  warn:  (msg, ...args) => console.warn(msg, ...args),
  error: (msg, ...args) => console.error(msg, ...args),
})
```

## What it detects

| Feature | Detection |
|---|---|
| Market structure | Swing and internal structure, with BOS and CHoCH |
| Order blocks | HP, continuation, breaker, mitigation and reclaimed types, with formation, mitigation and price interaction tracking |
| Fair value gaps | Bullish and bearish imbalances, with fill tracking and an optional automatic threshold |
| Equal highs and lows | Liquidity pools |
| Liquidity grabs | Stop hunts at equal levels, with follow-through detection |
| Premium and discount zones | Zones with a 5% threshold, matching the Pine Script version |
| Volume | Spikes, institutional volume and the running average, with a configurable spike threshold |
| Sessions | Asian, London, London and New York overlap, New York |
| Market maker model | Wyckoff phases (accumulation, markup, distribution, markdown) with a confidence score |
| Order flow | Absorption, exhaustion, initiative and responsive signals |
| Confluence | A multi-factor score of more than 100 points |
| Exhaustion | Multi-factor exhaustion analysis |

## Types

All types are exported from the package:

```typescript
import {
  SmartMoneyConcepts,
  SmartMoneyConceptsConfig,
  Alerts,
  Candle,
  OrderBlock,
  OrderBlockType,
  FairValueGap,
  LiquidityGrab,
  TrendBias,
  Zone,
  MarketPhase,
  MarketMakerAnalysis,
  OrderFlowSignal,
  OrderFlowType,
  TradingSession,
  ConfluenceComponents,
  // ...and more
} from 'smart-money-concepts'
```

## License

MIT
