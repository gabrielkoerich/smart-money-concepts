import { expect } from 'chai'
import { SmartMoneyConcepts } from '../src/index.js'
import { debug } from './config/mocha.js'
import { buildInitialStructure, getTestSMCConfig } from './helpers/smcTestHelpers.js'

describe('SmartMoneyConcepts (Simplified)', () => {
    let smc: SmartMoneyConcepts

    beforeEach(() => {
        // Create a fresh instance before each test
        smc = new SmartMoneyConcepts(getTestSMCConfig())
    })

    describe('Trend Bias Detection', () => {
        it('should detect a bullish trend bias', () => {
            // Build downtrend structure first
            let currentTime = buildInitialStructure(smc, 'down')

            // Now create strong bullish reversal and continuation
            const bullishCandles = [
                { open: 80, high: 95, low: 75, close: 93 }, // Strong bullish reversal
                { open: 93, high: 100, low: 90, close: 98 },
                { open: 98, high: 105, low: 95, close: 103 },
                { open: 103, high: 95, low: 90, close: 92 }, // Pullback
                { open: 92, high: 110, low: 90, close: 108 }, // Break higher (BOS)
                { open: 108, high: 118, low: 105, close: 115 },
                { open: 115, high: 98, low: 95, close: 97 }, // Pullback
                { open: 97, high: 125, low: 95, close: 123 }, // Another higher high
                { open: 123, high: 135, low: 120, close: 132 },
                { open: 132, high: 145, low: 130, close: 142 },
            ]

            // Feed candles
            for (let i = 0; i < bullishCandles.length; i++) {
                const candle = bullishCandles[i]
                smc.update(
                    candle.high,
                    candle.low,
                    candle.open,
                    candle.close,
                    currentTime + i * 60 * 1000,
                )
            }

            // Check the trend bias
            expect(smc.getTrendBias()).to.equal('Bullish')
        })

        it('should detect a bearish trend bias', () => {
            // Build uptrend structure first
            let currentTime = buildInitialStructure(smc, 'up')

            // Now create strong bearish reversal and continuation
            const bearishCandles = [
                { open: 95, high: 100, low: 80, close: 82 }, // Strong bearish reversal
                { open: 82, high: 85, low: 75, close: 77 },
                { open: 77, high: 80, low: 70, close: 72 },
                { open: 72, high: 85, low: 70, close: 83 }, // Pullback
                { open: 83, high: 85, low: 65, close: 67 }, // Break lower (BOS)
                { open: 67, high: 70, low: 60, close: 62 },
                { open: 62, high: 75, low: 60, close: 73 }, // Pullback
                { open: 73, high: 75, low: 55, close: 57 }, // Another lower low
                { open: 57, high: 60, low: 50, close: 52 },
                { open: 52, high: 55, low: 45, close: 47 },
            ]

            // Feed candles
            for (let i = 0; i < bearishCandles.length; i++) {
                const candle = bearishCandles[i]
                smc.update(
                    candle.high,
                    candle.low,
                    candle.open,
                    candle.close,
                    currentTime + i * 60 * 1000,
                )
            }

            // Check the trend bias
            expect(smc.getTrendBias()).to.equal('Bearish')
        })
    })

    describe('Market Zone Detection', () => {
        it('should detect Premium zone', () => {
            // Create a price action that should put price in Premium zone
            // First establish a range
            const premiumCandles = [
                { open: 100, high: 110, low: 95, close: 108 },
                { open: 108, high: 115, low: 105, close: 112 },
                { open: 112, high: 118, low: 110, close: 116 },
                // Now make a significant move up into premium zone
                { open: 116, high: 140, low: 115, close: 138 },
                { open: 138, high: 145, low: 135, close: 142 },
            ]

            // Feed candles with proper timing
            const baseTime = Date.now()
            for (let i = 0; i < premiumCandles.length; i++) {
                const candle = premiumCandles[i]
                smc.update(
                    candle.high,
                    candle.low,
                    candle.open,
                    candle.close,
                    baseTime + i * 60 * 1000,
                )
            }

            const indicators = {
                trendBias: smc.getTrendBias(),
                internalBias: smc.getInternalBias(),
                currentZone: smc.getCurrentZone(),
                alerts: smc.getAlerts().getTrueAlerts(),
                orderBlocks: smc.getOrderBlocks(),
            }

            // debug({ indicators })

            // Check the zone with current price (range 95-145, premium >= 143.5)
            expect(smc.getCurrentZone(142.5)).to.equal('Premium')
        })

        it('should detect Discount zone', () => {
            // Create a price action that should put price in Discount zone
            // First establish a range
            const discountCandles = [
                { open: 100, high: 110, low: 95, close: 108 },
                { open: 108, high: 115, low: 105, close: 112 },
                { open: 112, high: 118, low: 110, close: 116 },
                // Now make a significant move down into discount zone
                { open: 116, high: 117, low: 90, close: 92 },
                { open: 92, high: 95, low: 85, close: 88 },
            ]

            // Feed candles with proper timing
            const baseTime = Date.now()
            for (let i = 0; i < discountCandles.length; i++) {
                const candle = discountCandles[i]
                smc.update(
                    candle.high,
                    candle.low,
                    candle.open,
                    candle.close,
                    baseTime + i * 60 * 1000,
                )
            }

            // Check the zone with current price (range 85-118, discount <= 86.65)
            expect(smc.getCurrentZone(86)).to.equal('Discount')
        })

        it('should detect Equilibrium zone', () => {
            // Create a price action that should keep price in Equilibrium zone
            const equilibriumCandles = [
                { open: 100, high: 110, low: 95, close: 108 },
                { open: 108, high: 115, low: 105, close: 112 },
                { open: 112, high: 118, low: 110, close: 116 },
                { open: 116, high: 120, low: 114, close: 118 },
                { open: 118, high: 122, low: 116, close: 120 },
            ]

            // Feed candles with proper timing
            const baseTime = Date.now()
            for (let i = 0; i < equilibriumCandles.length; i++) {
                const candle = equilibriumCandles[i]
                smc.update(
                    candle.high,
                    candle.low,
                    candle.open,
                    candle.close,
                    baseTime + i * 60 * 1000,
                )
            }

            // Check the zone with a price in the middle of the range
            expect(smc.getCurrentZone(110)).to.equal('Equilibrium')
        })
    })
})
