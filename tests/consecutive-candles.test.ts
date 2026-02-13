import { expect } from 'chai'
import { SmartMoneyConcepts } from '../src/index.js'

describe('SmartMoneyConcepts - Consecutive Candle Detection', function () {
    it('should detect consecutive bearish candles', () => {
        const smc = new SmartMoneyConcepts()

        // Add bullish candles first
        smc.update(100, 99, 99, 100, Date.now() - 5000, 1000) // bullish
        smc.update(101, 100, 100, 101, Date.now() - 4000, 1000) // bullish

        // Now add 3 bearish candles
        smc.update(101, 99, 101, 99, Date.now() - 3000, 1000) // bearish
        smc.update(99, 97, 99, 97, Date.now() - 2000, 1000) // bearish
        smc.update(97, 95, 97, 95, Date.now() - 1000, 1000) // bearish

        const result = smc.getConsecutiveCandles()
        expect(result.consecutiveBearish).to.equal(2) // skip current  candle
        expect(result.consecutiveBullish).to.equal(0)
        expect(result.lastCandleDirection).to.equal('bearish')
    })

    it('should detect consecutive bullish candles', () => {
        const smc = new SmartMoneyConcepts()

        // Add bearish candles first
        smc.update(100, 99, 100, 99, Date.now() - 5000, 1000) // bearish
        smc.update(99, 98, 99, 98, Date.now() - 4000, 1000) // bearish

        // Now add 4 bullish candles
        smc.update(99, 98, 98, 99, Date.now() - 3000, 1000) // bullish
        smc.update(100, 99, 99, 100, Date.now() - 2000, 1000) // bullish
        smc.update(101, 100, 100, 101, Date.now() - 1000, 1000) // bullish
        smc.update(102, 101, 101, 102, Date.now(), 1000) // bullish

        const result = smc.getConsecutiveCandles()
        expect(result.consecutiveBullish).to.equal(3) // only last candle
        expect(result.consecutiveBearish).to.equal(0)
        expect(result.lastCandleDirection).to.equal('bullish')
    })

    it('should handle empty data', () => {
        const smc = new SmartMoneyConcepts()

        const result = smc.getConsecutiveCandles()
        expect(result.consecutiveBullish).to.equal(0)
        expect(result.consecutiveBearish).to.equal(0)
        expect(result.lastCandleDirection).to.equal('doji')
    })

    it('should handle doji candles', () => {
        const smc = new SmartMoneyConcepts()

        // Add a doji (open = close)
        smc.update(100, 99, 100, 100, Date.now(), 1000)

        const result = smc.getConsecutiveCandles()
        expect(result.consecutiveBullish).to.equal(0)
        expect(result.consecutiveBearish).to.equal(0)
        expect(result.lastCandleDirection).to.equal('doji')
    })

    it('should be included in debugInfo from getDebugInfo()', () => {
        const smc = new SmartMoneyConcepts()

        // Add 2 bearish candles
        smc.update(100, 99, 100, 99, Date.now() - 1000, 1000) // bearish
        smc.update(99, 97, 99, 97, Date.now(), 1000) // bearish

        const debugInfo = smc.getDebugInfo(97)
        expect(debugInfo.candlePatterns).to.not.be.undefined
        expect(debugInfo.candlePatterns?.consecutiveBearish).to.equal(1) // only last candle
        expect(debugInfo.candlePatterns?.consecutiveBullish).to.equal(0)
        expect(debugInfo.candlePatterns?.lastCandleDirection).to.equal('bearish')
    })
})
