import { expect } from 'chai'
import { SmartMoneyConcepts } from '../src/index.js'
import { buildInitialStructure, getTestSMCConfig } from './helpers/smcTestHelpers.js'
// import { debug } from '../../config/mocha'

describe('SmartMoneyConcepts - Order Block Alerts', () => {
    it('should set swingBullishObBrokenDown alert when price enters bullish OB (broken DOWN - bearish signal)', () => {
        const smc = new SmartMoneyConcepts(getTestSMCConfig())

        // Build initial downtrend structure first
        let currentTime = buildInitialStructure(smc, 'down')

        // GOAL: Create a bullish order block (demand zone where price reversed upward)
        // In SMC, a bullish OB is the last DOWN candle before a strong UP move from a swing low

        // Use exact pattern from successful comprehensive test that creates OBs
        const candles = [
            { open: 80, high: 95, low: 75, close: 93 },
            { open: 93, high: 100, low: 90, close: 98 },
            { open: 98, high: 105, low: 95, close: 103 },
            { open: 103, high: 95, low: 90, close: 92 }, // Pullback - creates OB
            { open: 92, high: 110, low: 90, close: 108 }, // BOS
            { open: 108, high: 118, low: 105, close: 115 },
            { open: 115, high: 125, low: 113, close: 122 },
            { open: 122, high: 135, low: 120, close: 132 },
        ]

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i]
            smc.update(c.high, c.low, c.open, c.close, currentTime + i * 60000, 1000)
        }

        // Phase 4: Verify bullish OB was created
        const obs = smc.getOrderBlocks()
        // debug(`Order blocks created: ${obs.swing.length} swing, ${obs.internal.length} internal`)

        // Find the bullish OB (bias=1) in the swing OBs
        const bullishOB = obs.swing.find(ob => ob.bias === 1)
        // if (!bullishOB) {
        // debug(
        //     'Available OBs:',
        //     obs.swing.map(ob => ({
        //         bias: ob.bias,
        //         high: ob.barHigh,
        //         low: ob.barLow,
        //         mitigated: ob.mitigated,
        //     })),
        // )
        // }
        expect(bullishOB, 'Should have created a bullish swing OB (bias=1)').to.exist
        // debug(
        //     `Bullish OB found: high=${bullishOB!.barHigh}, low=${bullishOB!.barLow}, mitigated=${bullishOB!.mitigated}`,
        // )

        // Phase 5: Move price back down to mitigate the bullish OB
        // Price needs to go BELOW the bullish OB's low to trigger mitigation
        const targetLow = bullishOB!.barLow
        // debug(`Target to mitigate: price must go below ${targetLow}`)

        let foundBullishOBAlert = false
        let alertCandle = 0

        const startIndex = candles.length
        for (let i = startIndex; i < startIndex + 70; i++) {
            // Gradually drop price to cross below OB low
            const price = 132 - (i - startIndex) * 1.2 // Drop from 132
            const low = price - 1
            smc.update(price + 0.5, low, price + 0.3, price - 0.5, currentTime + i * 60000, 1000)

            const alerts = smc.getAlerts()
            if (alerts.swingBullishObBrokenDown) {
                foundBullishOBAlert = true
                alertCandle = i
                // debug(
                //     `✅ Found swingBullishObBrokenDown alert at candle ${i}, low ${low} (target was ${targetLow})`,
                // )
                break
            }
        }

        // if (!foundBullishOBAlert) {
        //     debug(
        //         `❌ No alert found. Final OB: mitigated=${bullishOB!.mitigated}, final low reached ~${215 - (149 - 80) * 0.8}`,
        //     )
        // }

        expect(foundBullishOBAlert, 'Should detect bullish Order Block mitigation').to.be.true
        expect(alertCandle).to.be.greaterThan(0)
    })

    it('should set swingBearishObBrokenUp alert when price enters bearish OB (broken UP - bullish signal)', () => {
        const smc = new SmartMoneyConcepts({
            swingsLengthInput: 10, // Shorter for faster pivot confirmation
        })
        const baseTime = Date.now()

        // GOAL: Create a bearish order block (supply zone where price reversed downward)
        // In SMC, a bearish OB is the last UP candle before a strong DOWN move from a swing high

        // Phase 1: Establish initial uptrend (50+ bars to build structure)
        for (let i = 0; i < 50; i++) {
            const price = 100 + i * 0.5 // 100 up to 125
            smc.update(price + 1, price - 1, price - 0.3, price + 0.5, baseTime + i * 60000, 1000)
        }

        // Phase 2: Create the swing high pivot with a strong bullish candle
        // This bullish candle (bar 50) will become the bearish order block
        smc.update(132, 126, 127, 131, baseTime + 50 * 60000, 2000) // Strong up candle at high

        // Phase 3: Strong bearish reversal from the high (this confirms the OB)
        // Multiple strong bearish candles to establish downtrend
        for (let i = 51; i < 80; i++) {
            const price = 131 - (i - 50) * 1.5 // 131 down to ~87
            smc.update(price + 0.5, price - 2, price + 0.3, price - 1.5, baseTime + i * 60000, 1500)
        }

        // Phase 4: Verify bearish OB was created
        const obs = smc.getOrderBlocks()
        // debug(`Order blocks created: ${obs.swing.length} swing, ${obs.internal.length} internal`)

        // Find the bearish OB (bias=-1) in the swing OBs
        const bearishOB = obs.swing.find(ob => ob.bias === -1)
        if (!bearishOB) {
            // debug(
            //     'Available OBs:',
            //     obs.swing.map(ob => ({
            //         bias: ob.bias,
            //         high: ob.barHigh,
            //         low: ob.barLow,
            //         mitigated: ob.mitigated,
            //     })),
            // )
        }
        expect(bearishOB, 'Should have created a bearish swing OB (bias=-1)').to.exist
        // debug(
        //     `Bearish OB found: high=${bearishOB!.barHigh}, low=${bearishOB!.barLow}, mitigated=${bearishOB!.mitigated}`,
        // )

        // Phase 5: Move price back up to mitigate the bearish OB
        // Price needs to go ABOVE the bearish OB's high to trigger mitigation
        const targetHigh = bearishOB!.barHigh
        // debug(`Target to mitigate: price must go above ${targetHigh}`)

        let foundBearishOBAlert = false
        let alertCandle = 0

        for (let i = 80; i < 150; i++) {
            // Gradually rise to cross above OB high
            const price = 87 + (i - 80) * 0.8 // Rise from 87
            const high = price + 1
            smc.update(high, price - 0.5, price - 0.3, price + 0.5, baseTime + i * 60000, 1000)

            const alerts = smc.getAlerts()
            if (alerts.swingBearishObBrokenUp) {
                foundBearishOBAlert = true
                alertCandle = i
                // debug(
                //     `✅ Found swingBearishObBrokenUp alert at candle ${i}, high ${high} (target was ${targetHigh})`,
                // )
                break
            }
        }

        if (!foundBearishOBAlert) {
            // debug(
            //     `❌ No alert found. Final OB: mitigated=${bearishOB!.mitigated}, final high reached ~${87 + (149 - 80) * 0.8 + 1}`,
            // )
        }

        expect(foundBearishOBAlert, 'Should detect bearish Order Block mitigation').to.be.true
        expect(alertCandle).to.be.greaterThan(0)
    })

    it('should not set OB alert if price does not mitigate the OB', () => {
        const smc = new SmartMoneyConcepts()
        const baseTime = Date.now()

        // Build structure
        for (let i = 0; i < 60; i++) {
            const price = 100 + Math.random() * 5
            smc.update(price + 2, price - 2, price + 1, price, baseTime + i * 60000, 1000)
        }

        // Create a pivot
        smc.update(92, 88, 91, 89, baseTime + 60 * 60000, 1000)

        // Move up but not enough to cross back down to OB
        for (let i = 61; i < 115; i++) {
            const price = 89 + (i - 60) * 0.3
            smc.update(price + 2, price - 2, price + 1, price, baseTime + i * 60000, 1000)
        }

        // const orderBlocks = smc.getOrderBlocks()

        // debug({
        //     orderBlocks,
        //     swingObs: orderBlocks.swing.length,
        //     internalObs: orderBlocks.internal.length,
        // })

        // Stay above the OB - don't mitigate it
        for (let i = 115; i < 130; i++) {
            const close = 107 - (i - 115) * 0.1 // Very shallow decline, stays above OB

            const high = close - 1
            const low = close - 2
            const open = close + 1

            smc.update(high, low, open, close, baseTime + i * 60000, 1000)

            const alerts = smc.getAlerts()

            // if (alerts.swingBullishObBrokenDown) {
            //     const indicators = {
            //         trendBias: smc.getTrendBias(),
            //         internalBias: smc.getInternalBias(),
            //         currentZone: smc.getCurrentZone(),
            //         alerts: alerts.getTrueAlerts(),
            //     }

            //     const orderBlocks = smc.getOrderBlocks()

            //     debug({
            //         indicators,
            //         orderBlocks,
            //         swingObs: orderBlocks.swing.length,
            //         internalObs: orderBlocks.internal.length,
            //         high,
            //         low,
            //         open,
            //         close,
            //     })
            // }

            expect(
                alerts.swingBullishObBrokenDown,
                `Candle ${i} should not have swingBullishObBrokenDown alert`,
            ).to.be.false
        }
    })
})
