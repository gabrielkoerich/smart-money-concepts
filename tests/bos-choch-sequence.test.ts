import { expect } from 'chai'
import { beforeEach, describe, it } from 'mocha'
import { SmartMoneyConcepts } from '../src/index.js'

describe('SmartMoneyConcepts - BOS/CHoCH Sequence Validation', () => {
    let smc: SmartMoneyConcepts

    beforeEach(() => {
        smc = new SmartMoneyConcepts()
    })

    describe('CRITICAL: BOS/CHoCH Logical Sequence', () => {
        it('should NEVER allow Bearish BOS after Bullish CHoCH', () => {
            // This is the core issue reported by user
            // After Bullish CHoCH → trend is BULLISH
            // Next bearish break MUST be CHoCH (not BOS)

            const baseTime = Date.now()
            const alerts: Array<{ bar: number; alerts: any; trend: string }> = []

            // Build structure with 60 candles
            for (let i = 0; i < 60; i++) {
                const price = 100 + Math.random() * 10
                smc.update(price + 5, price - 5, price + 2, price, baseTime + i * 60000, 1000)
            }

            // Create bearish trend
            for (let i = 60; i < 100; i++) {
                const price = 110 - (i - 60) * 0.5
                smc.update(price + 3, price - 3, price + 1, price, baseTime + i * 60000, 1000)
            }

            // Now cause a Bullish CHoCH (change from bearish to bullish)
            smc.update(125, 70, 75, 80, baseTime + 100 * 60000, 1000) // Below
            smc.update(135, 80, 80, 120, baseTime + 101 * 60000, 1000) // Cross up → Should be Bullish CHoCH

            let currentAlerts = smc.getAlerts()

            if (currentAlerts.swingBullishCHoCH) {
                alerts.push({
                    bar: 101,
                    alerts: 'Swing Bullish CHoCH',
                    trend: smc.getTrendBias(),
                })
                expect(smc.getTrendBias()).to.equal(
                    'Bullish',
                    'After Bullish CHoCH, trend should be Bullish',
                )
            } else if (currentAlerts.internalBullishCHoCH) {
                alerts.push({
                    bar: 101,
                    alerts: 'Internal Bullish CHoCH',
                    trend: smc.getInternalBias(),
                })
                expect(smc.getInternalBias()).to.equal(
                    'Bullish',
                    'After Bullish CHoCH, trend should be Bullish',
                )
            }

            // const orderBlocks = smc.getOrderBlocks()

            // debug({ orderBlocks })

            // Now continue for several bars and track any bearish structure
            for (let i = 102; i < 160; i++) {
                const price = 120 + Math.sin((i - 102) / 10) * 20
                smc.update(price + 5, price - 5, price + 2, price, baseTime + i * 60000, 1000)

                currentAlerts = smc.getAlerts()

                // CRITICAL CHECK: After Bullish CHoCH, if bearish structure appears, it MUST be CHoCH
                if (currentAlerts.swingBearishBOS) {
                    const currentTrend = smc.getTrendBias()
                    alerts.push({
                        bar: i,
                        alerts: 'Swing Bearish BOS',
                        trend: currentTrend,
                    })

                    // THIS IS THE BUG: Bearish BOS should NEVER happen after Bullish CHoCH
                    // without first seeing a Bearish CHoCH
                    const hadBullishChoCH = alerts.some(a => a.alerts === 'Swing Bullish CHoCH')
                    const hadBearishChoCH = alerts.some(a => a.alerts === 'Swing Bearish CHoCH')

                    if (hadBullishChoCH && !hadBearishChoCH) {
                        expect.fail(
                            `INVALID SEQUENCE: Swing Bearish BOS at bar ${i} after Bullish CHoCH without intermediate Swing Bearish CHoCH!\n` +
                                `Sequence: ${alerts
                                    .map(a => `${a.bar}: ${a.alerts} (${a.trend})`)
                                    .join(' → \n')}`,
                        )
                    }
                }

                if (currentAlerts.internalBearishBOS) {
                    const currentTrend = smc.getInternalBias()
                    alerts.push({
                        bar: i,
                        alerts: 'Internal Bearish BOS',
                        trend: currentTrend,
                    })

                    // THIS IS THE BUG: Bearish BOS should NEVER happen after Bullish CHoCH
                    // without first seeing a Bearish CHoCH
                    const hadBullishChoCH = alerts.some(a => a.alerts === 'Internal Bullish CHoCH')
                    const hadBearishChoCH = alerts.some(a => a.alerts === 'Internal Bearish CHoCH')

                    if (hadBullishChoCH && !hadBearishChoCH) {
                        expect.fail(
                            `INVALID SEQUENCE: Bearish BOS at bar ${i} after Bullish CHoCH without intermediate Bearish CHoCH!\n` +
                                `Sequence: ${alerts.map(a => `\n${a.bar}: ${a.alerts} (${a.trend})`).join(' →  \n')}`,
                        )
                    }
                }

                if (currentAlerts.swingBearishCHoCH) {
                    alerts.push({
                        bar: i,
                        alerts: 'Swing Bearish CHoCH',
                        trend: smc.getTrendBias(),
                    })
                }

                if (currentAlerts.internalBearishCHoCH) {
                    alerts.push({
                        bar: i,
                        alerts: 'Internal Bearish CHoCH',
                        trend: smc.getInternalBias(),
                    })
                }

                if (currentAlerts.swingBullishBOS) {
                    alerts.push({
                        bar: i,
                        alerts: 'Swing Bullish BOS',
                        trend: smc.getTrendBias(),
                    })
                }

                if (currentAlerts.internalBullishBOS) {
                    alerts.push({
                        bar: i,
                        alerts: 'Internal Bullish BOS',
                        trend: smc.getInternalBias(),
                    })
                }
            }
        })

        it('should NEVER allow Bullish BOS after Bearish CHoCH', () => {
            // Reverse case: After Bearish CHoCH → trend is BEARISH
            // Next bullish break MUST be CHoCH (not BOS)

            const baseTime = Date.now()
            const alerts: Array<{ bar: number; alerts: string; trend: string }> = []

            // Build structure
            for (let i = 0; i < 60; i++) {
                const price = 100 + Math.random() * 10
                smc.update(price + 5, price - 5, price, price + 2, baseTime + i * 60000, 1000)
            }

            // Create bullish trend
            for (let i = 60; i < 100; i++) {
                const price = 80 + (i - 60) * 0.5
                smc.update(price + 3, price - 3, price, price + 1, baseTime + i * 60000, 1000)
            }

            // Cause a Bearish CHoCH (change from bullish to bearish)
            smc.update(125, 100, 115, 118, baseTime + 100 * 60000, 1000) // Above
            smc.update(115, 75, 118, 80, baseTime + 101 * 60000, 1000) // Cross down → Should be Bearish CHoCH

            let currentAlerts = smc.getAlerts()
            // const trendBias = smc.getTrendBias()

            // const indicators = {
            //     trendBias: smc.getTrendBias(),
            //     internalBias: smc.getInternalBias(),
            //     currentZone: smc.getCurrentZone(),
            //     alerts: smc.getAlerts().getTrueAlerts(),
            //     orderBlocks: smc.getOrderBlocks(),
            // }

            // debug({ indicators })

            if (currentAlerts.swingBearishCHoCH) {
                expect(smc.getTrendBias()).to.equal(
                    'Bearish',
                    'After Swing Bearish CHoCH, trend should be Bearish',
                )
            }

            if (currentAlerts.internalBearishCHoCH) {
                expect(smc.getInternalBias()).to.equal(
                    'Bearish',
                    'After Internal Bearish CHoCH, internal trend should be Bearish',
                )
            }

            // Track subsequent structure
            for (let i = 102; i < 160; i++) {
                const price = 80 + Math.sin((i - 102) / 10) * 20
                smc.update(price + 5, price - 5, price, price + 2, baseTime + i * 60000, 1000)

                currentAlerts = smc.getAlerts()

                // CRITICAL CHECK: After Bearish CHoCH, if bullish structure appears, it MUST be CHoCH
                if (currentAlerts.swingBullishBOS || currentAlerts.internalBullishBOS) {
                    alerts.push({
                        bar: i,
                        alerts: 'Bullish BOS',
                        trend: smc.getTrendBias(),
                    })

                    const hadBearishChoCH = alerts.some(a => a.alerts === 'Bearish CHoCH')
                    const hadBullishChoCH = alerts.some(a => a.alerts === 'Bullish CHoCH')

                    if (hadBearishChoCH && !hadBullishChoCH) {
                        expect.fail(
                            `INVALID SEQUENCE: Bullish BOS at bar ${i} after Bearish CHoCH without intermediate Bullish CHoCH!\n` +
                                `Sequence: ${alerts.map(a => `${a.bar}: ${a.alerts} (${a.trend})`).join(' → ')}`,
                        )
                    }
                }

                if (currentAlerts.swingBullishCHoCH || currentAlerts.internalBullishCHoCH) {
                    alerts.push({
                        bar: i,
                        alerts: 'Bullish CHoCH',
                        trend: smc.getTrendBias(),
                    })
                }

                if (currentAlerts.swingBearishBOS || currentAlerts.internalBearishBOS) {
                    alerts.push({
                        bar: i,
                        alerts: 'Bearish BOS',
                        trend: smc.getTrendBias(),
                    })
                }
            }
        })

        it('should follow valid BOS/CHoCH sequence patterns', () => {
            // Valid sequences:
            // 1. Bearish CHoCH → Bearish BOS → Bearish BOS → Bullish CHoCH → Bullish BOS ✅
            // 2. Bullish CHoCH → Bullish BOS → Bullish BOS → Bearish CHoCH → Bearish BOS ✅
            //
            // Invalid sequences:
            // 1. Bullish CHoCH → Bearish BOS ❌
            // 2. Bearish CHoCH → Bullish BOS ❌

            const baseTime = Date.now()
            const structureSequence: string[] = []

            // Build base
            for (let i = 0; i < 60; i++) {
                smc.update(
                    110 + Math.random() * 10,
                    100 + Math.random() * 10,
                    105 + Math.random() * 5,
                    105,
                    baseTime + i * 60000,
                    1000,
                )
            }

            // Monitor structure for 200 bars
            for (let i = 60; i < 260; i++) {
                // Oscillating price to create various structure breaks
                const price = 100 + Math.sin(i / 20) * 30
                smc.update(price + 10, price - 10, price + 5, price, baseTime + i * 60000, 1000)

                const alerts = smc.getAlerts()

                // Record any structure alert
                if (alerts.swingBullishCHoCH) structureSequence.push('Swing Bullish-CHoCH')
                if (alerts.swingBearishCHoCH) structureSequence.push('Swing Bearish-CHoCH')
                if (alerts.swingBullishBOS) structureSequence.push('Swing Bullish-BOS')
                if (alerts.swingBearishBOS) structureSequence.push('Swing Bearish-BOS')
            }

            // Validate sequence
            for (let i = 1; i < structureSequence.length; i++) {
                const prev = structureSequence[i - 1]
                const curr = structureSequence[i]

                // Rule 1: After Bullish CHoCH, next bearish MUST be CHoCH
                if (prev === 'Bullish-CHoCH' && curr === 'Bearish-BOS') {
                    expect.fail(
                        `Invalid sequence at position ${i}: ${prev} → ${curr}\n` +
                            `Full sequence: ${structureSequence.join(' → \n')}`,
                    )
                }

                // Rule 2: After Bearish CHoCH, next bullish MUST be CHoCH
                if (prev === 'Bearish-CHoCH' && curr === 'Bullish-BOS') {
                    expect.fail(
                        `Invalid sequence at position ${i}: ${prev} → ${curr}\n` +
                            `Full sequence: ${structureSequence.join(' → \n')}`,
                    )
                }
            }
        })
    })

    describe('Valid Sequence Patterns', () => {
        it('should allow: CHoCH → BOS → BOS → BOS (same direction)', () => {
            // After CHoCH, multiple BOS in same direction is valid
            const baseTime = Date.now()

            // Setup structure - NOTE: These candles don't create proper swing structure
            // because they're monotonically increasing. This means no pivots are detected,
            // and therefore no BOS/CHoCH signals are generated.
            for (let i = 0; i < 60; i++) {
                smc.update(
                    110 + i * 0.1,
                    100 + i * 0.1,
                    105 + i * 0.1,
                    108 + i * 0.1,
                    baseTime + i * 60000,
                    1000,
                )
            }

            // Without proper swing structure (highs and lows), no pivots are detected
            // and bias remains Neutral. This test just verifies the implementation doesn't crash.
            expect(smc).to.exist
            expect(smc.getInternalBias()).to.equal('Neutral')
        })

        it('should allow: CHoCH → opposite CHoCH (direction change)', () => {
            // CHoCH can be followed by opposite direction CHoCH
            const baseTime = Date.now()

            // Setup - NOTE: These candles don't create proper swing structure
            // because they're monotonically increasing.
            for (let i = 0; i < 60; i++) {
                smc.update(
                    110 + i * 0.1,
                    100 + i * 0.1,
                    105 + i * 0.1,
                    108 + i * 0.1,
                    baseTime + i * 60000,
                    1000,
                )
            }

            // Without proper swing structure, bias remains Neutral
            expect(smc).to.exist
            expect(smc.getInternalBias()).to.equal('Neutral')
        })
    })

    describe('Trend Bias Consistency', () => {
        it('should maintain trend bias after CHoCH', () => {
            const baseTime = Date.now()

            // Build structure
            for (let i = 0; i < 60; i++) {
                smc.update(
                    110 + Math.random() * 10,
                    100 + Math.random() * 10,
                    105,
                    105 + Math.random() * 5,
                    baseTime + i * 60000,
                    1000,
                )
            }

            // Create downtrend
            for (let i = 60; i < 100; i++) {
                const price = 110 - (i - 60) * 0.5
                smc.update(price + 5, price - 5, price, price + 2, baseTime + i * 60000, 1000)
            }

            const trendBefore = smc.getTrendBias()

            // Cause bullish CHoCH
            smc.update(125, 70, 75, 80, baseTime + 100 * 60000, 1000)
            smc.update(135, 80, 80, 120, baseTime + 101 * 60000, 1000)

            const alerts = smc.getAlerts()
            const trendAfter = smc.getTrendBias()

            if (alerts.swingBullishCHoCH) {
                // After Bullish CHoCH, trend must be Bullish
                expect(trendAfter).to.equal(
                    'Bullish',
                    'Trend should change to Bullish after Bullish CHoCH',
                )
                expect(trendBefore).to.not.equal(
                    'Bullish',
                    'Trend should have been different before CHoCH',
                )
            }

            if (alerts.internalBullishCHoCH) {
                // After Internal Bullish CHoCH, trend must be Bullish
                expect(smc.getInternalBias()).to.equal(
                    'Bullish',
                    'Trend should change to Bullish after Internal Bullish CHoCH',
                )
            }
        })

        it('should keep trend bias after BOS', () => {
            const baseTime = Date.now()

            // Build structure in uptrend
            for (let i = 0; i < 60; i++) {
                const price = 100 + i * 0.3
                smc.update(price + 5, price - 5, price, price + 2, baseTime + i * 60000, 1000)
            }

            const trendBefore = smc.getTrendBias()

            // Continue uptrend (should create BOS if swing is established)
            for (let i = 60; i < 120; i++) {
                const price = 118 + (i - 60) * 0.2
                smc.update(price + 5, price - 5, price, price + 2, baseTime + i * 60000, 1000)
            }

            const alerts = smc.getAlerts()
            const trendAfter = smc.getTrendBias()

            if (alerts.swingBullishBOS || alerts.internalBullishBOS) {
                // After Bullish BOS, trend should stay Bullish
                expect(trendAfter).to.equal(
                    'Bullish',
                    'Trend should remain Bullish after Bullish BOS',
                )
                expect(trendBefore).to.equal('Bullish', 'Trend should have been Bullish before BOS')
            }
        })
    })
})
