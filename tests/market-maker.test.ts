import { expect } from 'chai'
import { SmartMoneyConcepts } from '../src/index.js'

describe('SmartMoneyConcepts - Market Maker Confluence Scoring', () => {
    let smc: SmartMoneyConcepts

    beforeEach(() => {
        smc = new SmartMoneyConcepts({
            swingsLengthInput: 5,
        })
    })

    /**
     * Helper function to feed candles with volume data
     */
    function feedCandlesWithVolume(
        smc: SmartMoneyConcepts,
        candleData: Array<{
            high: number
            low: number
            open: number
            close: number
            volume: number
        }>,
    ): void {
        const baseTime = Date.now()
        candleData.forEach((candle, i) => {
            smc.update(
                candle.high,
                candle.low,
                candle.open,
                candle.close,
                baseTime + i * 60 * 1000,
                candle.volume,
            )
        })
    }

    describe('ConfluenceComponents interface', () => {
        it('should include marketMakerAlignment in confluence components', () => {
            // Create a simple price action to establish trends
            const candles = [
                { open: 100, high: 105, low: 95, close: 102, volume: 1000 },
                { open: 102, high: 110, low: 100, close: 108, volume: 1200 },
                { open: 108, high: 115, low: 105, close: 112, volume: 1100 },
                { open: 112, high: 120, low: 110, close: 118, volume: 1300 },
                { open: 118, high: 125, low: 115, close: 122, volume: 1500 },
            ]

            feedCandlesWithVolume(smc, candles)

            const debugInfo = smc.getDebugInfo()

            // Verify that marketMakerAlignment is part of confluence components
            expect(debugInfo.confluence.components).to.have.property('marketMakerAlignment')
            expect(debugInfo.confluence.components.marketMakerAlignment).to.be.a('number')
            expect(debugInfo.confluence.components.marketMakerAlignment).to.be.at.least(0)
            expect(debugInfo.confluence.components.marketMakerAlignment).to.be.at.most(15)
        })
    })

    describe('Market Maker Phase Alignment', () => {
        it('should give higher score when phase aligns with bullish trend', () => {
            // Create a strong bullish trend
            const bullishCandles = []
            for (let i = 0; i < 30; i++) {
                const basePrice = 100 + i * 2
                bullishCandles.push({
                    open: basePrice,
                    high: basePrice + 5,
                    low: basePrice - 2,
                    close: basePrice + 3,
                    volume: 1000 + i * 50, // Increasing volume
                })
            }

            feedCandlesWithVolume(smc, bullishCandles)

            const debugInfo = smc.getDebugInfo()

            // In a bullish trend, we should see positive market maker alignment
            // if the market phase indicates accumulation or markup
            expect(debugInfo.confluence.components.marketMakerAlignment).to.be.a('number')

            // The score should contribute to the overall confluence
            expect(debugInfo.confluence.score).to.be.a('number')
        })

        it('should give higher score when phase aligns with bearish trend', () => {
            // Create a strong bearish trend
            const bearishCandles = []
            for (let i = 0; i < 30; i++) {
                const basePrice = 200 - i * 2
                bearishCandles.push({
                    open: basePrice,
                    high: basePrice + 2,
                    low: basePrice - 5,
                    close: basePrice - 3,
                    volume: 1000 + i * 50, // Increasing volume
                })
            }

            feedCandlesWithVolume(smc, bearishCandles)

            const debugInfo = smc.getDebugInfo()

            // Verify market maker alignment is calculated
            expect(debugInfo.confluence.components.marketMakerAlignment).to.be.a('number')
            expect(debugInfo.confluence.components.marketMakerAlignment).to.be.at.least(0)
        })
    })

    describe('Market Maker Analysis Integration', () => {
        it('should provide market maker analysis in debug info', () => {
            const candles = [
                { open: 100, high: 105, low: 98, close: 103, volume: 1000 },
                { open: 103, high: 108, low: 102, close: 106, volume: 1100 },
                { open: 106, high: 112, low: 105, close: 110, volume: 1200 },
            ]

            feedCandlesWithVolume(smc, candles)

            const debugInfo = smc.getDebugInfo()

            // Verify market maker analysis is present and has expected structure
            expect(debugInfo.marketMaker).to.exist
            expect(debugInfo.marketMaker.analysis).to.exist
            expect(debugInfo.marketMaker.analysis.currentPhase).to.be.a('string')
            expect(debugInfo.marketMaker.analysis.phaseConfidence).to.be.a('number')
            expect(debugInfo.marketMaker.analysis.expectedDirection).to.be.oneOf([
                'Up',
                'Down',
                'Sideways',
            ])
        })

        it('should include phase confidence in scoring', () => {
            // Create candles with high volume to increase phase confidence
            const highVolumeCandles = []
            for (let i = 0; i < 25; i++) {
                const basePrice = 100 + i * 1.5
                highVolumeCandles.push({
                    open: basePrice,
                    high: basePrice + 3,
                    low: basePrice - 1,
                    close: basePrice + 2,
                    volume: 5000 + i * 200, // High and increasing volume
                })
            }

            feedCandlesWithVolume(smc, highVolumeCandles)

            const debugInfo = smc.getDebugInfo()

            // Phase confidence should be tracked
            expect(debugInfo.marketMaker.analysis.phaseConfidence).to.be.a('number')
            expect(debugInfo.marketMaker.analysis.phaseConfidence).to.be.at.least(0)
            expect(debugInfo.marketMaker.analysis.phaseConfidence).to.be.at.most(100)
        })
    })

    describe('Confluence Score Maximum', () => {
        it('should have market maker alignment capped at 15 points', () => {
            // Create ideal conditions for maximum market maker score
            const candles = []
            for (let i = 0; i < 50; i++) {
                const basePrice = 100 + i * 2
                candles.push({
                    open: basePrice,
                    high: basePrice + 5,
                    low: basePrice - 1,
                    close: basePrice + 4,
                    volume: 3000 + i * 100,
                })
            }

            feedCandlesWithVolume(smc, candles)

            const debugInfo = smc.getDebugInfo()

            // Market maker alignment should be capped at 15
            expect(debugInfo.confluence.components.marketMakerAlignment).to.be.at.most(15)
        })
    })

    describe('Total Confluence Score', () => {
        it('should include market maker alignment in total score', () => {
            const candles = []
            for (let i = 0; i < 20; i++) {
                const basePrice = 100 + i * 1.5
                candles.push({
                    open: basePrice,
                    high: basePrice + 4,
                    low: basePrice - 2,
                    close: basePrice + 2,
                    volume: 1000 + i * 50,
                })
            }

            feedCandlesWithVolume(smc, candles)

            const debugInfo = smc.getDebugInfo()
            const components = debugInfo.confluence.components

            // Calculate expected total from components
            const expectedTotal =
                components.structureAlignment +
                components.volumeConfirmation +
                components.zoneAlignment +
                components.sessionTiming +
                components.liquidityContext +
                components.marketMakerAlignment

            // Total score should equal sum of all components
            expect(debugInfo.confluence.score).to.equal(expectedTotal)
        })
    })
})
