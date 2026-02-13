import { expect } from 'chai'
import { SmartMoneyConcepts } from '../src/index.js'

describe('SmartMoneyConcepts - Intelligent Update Detection', () => {
    describe('update() method with duplicate timestamps', () => {
        it('should detect and update existing candle when timestamp matches', () => {
            const smc = new SmartMoneyConcepts({
                swingsLengthInput: 10,
                equalHighsLowsLengthInput: 3,
                equalHighsLowsThresholdInput: 0.1,
                internalOrderBlocksSizeInput: 5,
                swingOrderBlocksSizeInput: 5,
                orderBlockFilterInput: 'Atr',
                orderBlockMitigationInput: 'Close',
                fairValueGapsThresholdInput: true,
                fairValueGapsExtendInput: 1,
                internalFilterConfluenceInput: true,
                volumeThresholdInput: 1.5,
                requireVolumeConfirmation: false,
            })

            // Add initial candles
            const baseTime = Date.now()
            for (let i = 0; i < 50; i++) {
                smc.update(
                    100 + i * 0.1,
                    99 + i * 0.1,
                    99.5 + i * 0.1,
                    100 + i * 0.1,
                    baseTime + i * 60000,
                    1000,
                )
            }

            const debugBefore = smc.getDebugInfo()
            const barCountBefore = debugBefore.barInfo.currentBarIndex

            // Update the last bar multiple times (simulating price updates with same timestamp)
            const lastTime = baseTime + 49 * 60000
            smc.update(105.5, 104.5, 105, 105.2, lastTime, 1200)
            smc.update(105.8, 104.5, 105, 105.5, lastTime, 1300)
            smc.update(106.0, 104.5, 105, 105.8, lastTime, 1400)

            const debugAfter = smc.getDebugInfo()
            const barCountAfter = debugAfter.barInfo.currentBarIndex

            // Bar count should remain the same (no new bars added)
            expect(barCountAfter).to.equal(
                barCountBefore,
                'Bar count should not increase when updating same timestamp',
            )
        })

        it('should recalculate structure when updating existing candle', () => {
            const smc = new SmartMoneyConcepts({
                swingsLengthInput: 5,
                equalHighsLowsLengthInput: 3,
                equalHighsLowsThresholdInput: 0.1,
                internalOrderBlocksSizeInput: 3,
                swingOrderBlocksSizeInput: 3,
                orderBlockFilterInput: 'Atr',
                orderBlockMitigationInput: 'Close',
                fairValueGapsThresholdInput: true,
                fairValueGapsExtendInput: 1,
                internalFilterConfluenceInput: true,
                volumeThresholdInput: 1.5,
                requireVolumeConfirmation: false,
            })

            // Add candles to create some structure
            const baseTime = Date.now()
            const prices = [100, 101, 102, 101, 100, 99, 98, 99, 100, 101]

            for (let i = 0; i < prices.length; i++) {
                smc.update(
                    prices[i] + 1,
                    prices[i] - 1,
                    prices[i],
                    prices[i] + 0.5,
                    baseTime + i * 60000,
                    1000,
                )
            }

            const lastTime = baseTime + prices.length * 60000

            // Add a new bar
            smc.update(102, 100, 101, 101.5, lastTime, 1100)

            const trendBiasBefore = smc.getTrendBias()

            // Update last bar with significant price change (same timestamp)
            smc.update(105, 100, 101, 104, lastTime, 1500)

            const debugAfter = smc.getDebugInfo()
            const trendBiasAfter = smc.getTrendBias()

            // Structure should be recalculated
            expect(debugAfter.volume.current).to.equal(1500, 'Volume should be updated')
            expect(trendBiasAfter).to.be.a('string', 'Trend bias should be recalculated')
        })
    })
})
