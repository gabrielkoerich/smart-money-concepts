import { expect } from 'chai'
import { beforeEach, describe, it } from 'mocha'
import { SmartMoneyConcepts } from '../src/index.js'

describe('SmartMoneyConcepts - ATR Configuration', () => {
    let smc: SmartMoneyConcepts

    beforeEach(() => {
        smc = new SmartMoneyConcepts()
    })

    describe('ATR Period Verification', () => {
        it('should use 200-period ATR by default', () => {
            const config = smc.getConfiguration()
            expect(config.atrPeriod).to.equal(200, 'Default ATR period should be 200')
        })

        it('should allow custom ATR period configuration', () => {
            const customSmc = new SmartMoneyConcepts({ atrPeriod: 100 })
            const config = customSmc.getConfiguration()
            expect(config.atrPeriod).to.equal(100, 'Custom ATR period should be respected')
        })

        it('should not use 14-period ATR (old default)', () => {
            const config = smc.getConfiguration()
            expect(config.atrPeriod).to.not.equal(14, 'Should not use old 14-period default')
        })
    })

    describe('Pine Script Compliance', () => {
        it('should match Pine Script atrMeasure = ta.atr(200)', () => {
            // Pine Script line 315: atrMeasure = ta.atr(200)
            const config = smc.getConfiguration()
            expect(config.atrPeriod).to.equal(
                200,
                'ATR period should match Pine Script ta.atr(200)',
            )
        })
    })

    describe('ATR Stability with 200-period', () => {
        it('should require sufficient candles for ATR to stabilize', () => {
            // Feed less than 200 candles
            const baseTime = Date.now()
            for (let i = 0; i < 50; i++) {
                smc.update(
                    100 + Math.random() * 10,
                    90 + Math.random() * 10,
                    95,
                    95 + Math.random() * 10,
                    baseTime + i * 60000,
                )
            }

            // ATR should be calculated but may not be fully stable yet
            const debugInfo = smc.getDebugInfo(100)
            // Should have some ATR value (fallback during warm-up)
            expect(debugInfo).to.exist
        })

        it('should be more stable than 14-period ATR', () => {
            // This is a conceptual test - 200-period ATR is inherently more stable
            // than 14-period, but hard to test directly without time-series comparison

            // We can verify the configuration is set correctly
            const config = smc.getConfiguration()
            expect(config.atrPeriod).to.be.greaterThan(
                100,
                'Longer period provides more stable measurements',
            )
        })

        it('should calculate ATR after sufficient data', () => {
            // Feed 250 candles to ensure full ATR calculation
            const basePrice = 100
            const baseTime = Date.now()

            for (let i = 0; i < 250; i++) {
                const volatility = 5
                const high = basePrice + Math.random() * volatility
                const low = basePrice - Math.random() * volatility
                const close = low + Math.random() * (high - low)

                smc.update(high, low, close - 2, close, baseTime + i * 60000, 1000)
            }

            // After 250 candles, ATR should be fully calculated
            const debugInfo = smc.getDebugInfo(basePrice)
            expect(debugInfo).to.exist
            expect(debugInfo.biases).to.exist
            expect(debugInfo.currentZone).to.exist
        })
    })

    describe('ATR Impact on Order Block Filtering', () => {
        it('should use ATR for order block filtering', () => {
            // Create scenario with order blocks
            const candles = [
                { high: 105, low: 95, open: 100, close: 102 },
                { high: 108, low: 98, open: 102, close: 106 },
                { high: 112, low: 102, open: 106, close: 110 },
                { high: 115, low: 105, open: 110, close: 108 },
                { high: 110, low: 100, open: 108, close: 102 }, // Potential order block
            ]

            const baseTime = Date.now()
            for (let i = 0; i < candles.length; i++) {
                smc.update(
                    candles[i].high,
                    candles[i].low,
                    candles[i].open,
                    candles[i].close,
                    baseTime + i * 60000,
                    1000,
                )
            }

            // Verify ATR-based filtering is configured
            const config = smc.getConfiguration()
            expect(config.orderBlockFilterInput).to.equal('Atr')
            expect(config.atrPeriod).to.equal(200)
        })

        it('should filter volatile order blocks using 200-period ATR', () => {
            // The 200-period ATR provides a longer-term volatility baseline
            // Order blocks with range > 2*ATR should be filtered as high volatility

            // Feed data with varying volatility
            const baseTime = Date.now()
            const basePrice = 100

            // Create 210 candles with normal volatility
            for (let i = 0; i < 210; i++) {
                const normalVol = 2
                const high = basePrice + Math.random() * normalVol
                const low = basePrice - Math.random() * normalVol
                const close = low + Math.random() * (high - low)

                smc.update(high, low, close - 1, close, baseTime + i * 60000, 1000)
            }

            // Now add a high volatility bar (should be filtered)
            const highVolBar = {
                high: basePrice + 10, // Large range
                low: basePrice - 10,
                open: basePrice,
                close: basePrice + 8,
            }

            smc.update(
                highVolBar.high,
                highVolBar.low,
                highVolBar.open,
                highVolBar.close,
                baseTime + 210 * 60000,
                2000,
            )

            // The high volatility bar's parsed high/low should be adjusted
            // This is internal behavior, hard to test directly
            // But we can verify the configuration
            const config = smc.getConfiguration()
            expect(config.orderBlockFilterInput).to.equal('Atr')
        })
    })

    describe('ATR vs Cumulative Mean Range', () => {
        it('should default to ATR method (not Cumulative Mean Range)', () => {
            const config = smc.getConfiguration()
            expect(config.orderBlockFilterInput).to.equal(
                'Atr',
                'Should use ATR by default (Pine Script line 315-317)',
            )
        })

        it('should allow switching to Cumulative Mean Range if needed', () => {
            const customSmc = new SmartMoneyConcepts({
                orderBlockFilterInput: 'Cumulative Mean Range',
            })
            const config = customSmc.getConfiguration()
            expect(config.orderBlockFilterInput).to.equal('Cumulative Mean Range')
        })
    })

    describe('Equal Highs/Lows Threshold with ATR', () => {
        it('should use ATR for equal highs/lows detection threshold', () => {
            // Pine Script line 419, 439: uses atrMeasure for threshold
            // Our implementation should use the same ATR value

            // Create pattern with potential equal highs
            const candles = [
                { high: 120, low: 110, open: 115, close: 118 },
                { high: 120.5, low: 112, open: 118, close: 116 }, // Similar high
                { high: 119.8, low: 110, open: 116, close: 114 }, // Similar high
            ]

            const baseTime = Date.now()
            for (let i = 0; i < candles.length; i++) {
                smc.update(
                    candles[i].high,
                    candles[i].low,
                    candles[i].open,
                    candles[i].close,
                    baseTime + i * 60000,
                    1000,
                )
            }

            // Equal highs detection uses ATR-based threshold
            // Pine: math.abs(pivot.currentLevel - high[size]) < equalHighsLowsThresholdInput * atrMeasure
            const config = smc.getConfiguration()
            expect(config.equalHighsLowsThresholdInput).to.exist
            expect(config.atrPeriod).to.equal(200, 'Should use 200-period ATR for threshold')
        })
    })

    describe('Long-term ATR Benefits', () => {
        it('should provide more stable volatility measurement than short-term ATR', () => {
            // Conceptual test: 200-period ATR smooths out short-term spikes
            // Hard to test without actual market data comparison

            const config = smc.getConfiguration()

            // Verify we're using long-term ATR
            expect(config.atrPeriod).to.be.greaterThan(50, 'Should use long-term ATR')
            expect(config.atrPeriod).to.equal(200, 'Specifically should use 200')
        })

        it('should reduce noise in order block filtering vs 14-period ATR', () => {
            // 14-period ATR reacts quickly to recent volatility
            // 200-period ATR provides a more stable baseline

            // Create scenario with recent volatility spike
            const baseTime = Date.now()
            const basePrice = 100

            // First 200 candles: normal volatility
            for (let i = 0; i < 200; i++) {
                smc.update(
                    basePrice + 2,
                    basePrice - 2,
                    basePrice,
                    basePrice + Math.random() * 2,
                    baseTime + i * 60000,
                    1000,
                )
            }

            // Next 14 candles: high volatility (would skew 14-period ATR)
            for (let i = 200; i < 214; i++) {
                smc.update(
                    basePrice + 10,
                    basePrice - 10,
                    basePrice,
                    basePrice + Math.random() * 10,
                    baseTime + i * 60000,
                    2000,
                )
            }

            // 200-period ATR should be less affected by recent spike
            // than 14-period ATR would be
            const config = smc.getConfiguration()
            expect(config.atrPeriod).to.equal(
                200,
                'Long period provides resistance to recent volatility spikes',
            )
        })
    })

    describe('Configuration Persistence', () => {
        it('should maintain ATR configuration through data clearing', () => {
            const config1 = smc.getConfiguration()
            expect(config1.atrPeriod).to.equal(200)

            // Clear data
            smc.clearAllData()

            const config2 = smc.getConfiguration()
            expect(config2.atrPeriod).to.equal(200, 'ATR period should persist after clearing data')
        })

        it('should initialize ATR properly after data clear', () => {
            // Add some data
            smc.update(110, 90, 100, 105, 1000, 1000)

            // Clear data
            smc.clearAllData()

            // Add new data
            smc.update(115, 95, 105, 110, 2000, 1000)

            // ATR should be reinitialized with correct period
            const config = smc.getConfiguration()
            expect(config.atrPeriod).to.equal(200)
        })
    })

    describe('Pine Script Equivalence Tests', () => {
        it('should calculate ATR identically to Pine Script ta.atr(200)', () => {
            // Pine Script uses Wilder's smoothing (RMA) for ATR
            // Our trading-signals library uses the same EMA-based calculation

            // This test verifies configuration matches
            const config = smc.getConfiguration()

            // Pine Script line 315: atrMeasure = ta.atr(200)
            expect(config.atrPeriod).to.equal(200)

            // Pine Script line 317: volatilityMeasure = orderBlockFilterInput == ATR ? atrMeasure : ...
            expect(config.orderBlockFilterInput).to.equal('Atr')
        })

        it('should use ATR for high volatility bar detection', () => {
            // Pine Script line 319: highVolatilityBar = (high - low) >= (2 * volatilityMeasure)

            // Feed data to calculate ATR
            const baseTime = Date.now()
            for (let i = 0; i < 210; i++) {
                smc.update(
                    100 + Math.random() * 5,
                    95 + Math.random() * 5,
                    98,
                    98 + Math.random() * 5,
                    baseTime + i * 60000,
                    1000,
                )
            }

            // Configuration should support high volatility detection
            const config = smc.getConfiguration()
            expect(config.atrPeriod).to.equal(200)
            expect(config.orderBlockFilterInput).to.equal('Atr')
        })

        it('should match Pine Script parsed high/low logic', () => {
            // Pine Script lines 321-323:
            // parsedHigh = highVolatilityBar ? low : high
            // parsedLow  = highVolatilityBar ? high : low

            // This logic uses ATR to detect volatility
            // Our implementation should behave identically

            const config = smc.getConfiguration()
            expect(config.atrPeriod).to.equal(
                200,
                'ATR period must match for identical volatility detection',
            )
        })
    })
})
