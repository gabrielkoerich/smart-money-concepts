import { expect } from 'chai'
import { beforeEach, describe, it } from 'mocha'
import { SmartMoneyConcepts } from '../src/index.js'

describe('SmartMoneyConcepts - Premium/Discount Zones (5% Thresholds)', () => {
    let smc: SmartMoneyConcepts

    beforeEach(() => {
        smc = new SmartMoneyConcepts()
    })

    describe('5% Zone Threshold Verification', () => {
        it('should use 5% for premium zone (not 15%)', () => {
            // Establish a clear range: 100 - 200
            const candles = [
                { high: 150, low: 100, open: 120, close: 140 }, // Low at 100
                { high: 200, low: 140, open: 140, close: 180 }, // High at 200
                { high: 190, low: 150, open: 180, close: 170 },
            ]

            const baseTime = Date.now()
            for (let i = 0; i < candles.length; i++) {
                smc.update(
                    candles[i].high,
                    candles[i].low,
                    candles[i].open,
                    candles[i].close,
                    baseTime + i * 60000,
                )
            }

            // Range: 100 - 200 = 100
            // Premium zone (5%): >= 100 + 100*0.95 = 195
            // Equilibrium: 105 - 195
            // Discount zone (5%): <= 100 + 100*0.05 = 105

            // Test Premium boundary
            expect(smc.getCurrentZone(195)).to.equal('Premium', 'At 195 (95%) should be Premium')
            expect(smc.getCurrentZone(196)).to.equal('Premium', 'At 196 should be Premium')
            expect(smc.getCurrentZone(200)).to.equal('Premium', 'At 200 (top) should be Premium')

            // Test Equilibrium (middle 90%)
            expect(smc.getCurrentZone(194)).to.equal(
                'Equilibrium',
                'At 194 (below 95%) should be Equilibrium',
            )
            expect(smc.getCurrentZone(150)).to.equal(
                'Equilibrium',
                'At 150 (middle) should be Equilibrium',
            )
            expect(smc.getCurrentZone(106)).to.equal(
                'Equilibrium',
                'At 106 (above 5%) should be Equilibrium',
            )

            // Test Discount boundary
            expect(smc.getCurrentZone(105)).to.equal('Discount', 'At 105 (5%) should be Discount')
            expect(smc.getCurrentZone(104)).to.equal('Discount', 'At 104 should be Discount')
            expect(smc.getCurrentZone(100)).to.equal(
                'Discount',
                'At 100 (bottom) should be Discount',
            )
        })

        it('should NOT classify 85% as premium (old 15% threshold)', () => {
            // Range: 100 - 200
            const candles = [
                { high: 150, low: 100, open: 120, close: 140 },
                { high: 200, low: 140, open: 140, close: 180 },
                { high: 190, low: 150, open: 180, close: 170 },
            ]

            const baseTime = Date.now()
            for (let i = 0; i < candles.length; i++) {
                smc.update(
                    candles[i].high,
                    candles[i].low,
                    candles[i].open,
                    candles[i].close,
                    baseTime + i * 60000,
                )
            }

            // Old 15% threshold would have premium at >= 185
            // New 5% threshold has premium at >= 195

            // At 185 (which would be premium in old system) should be Equilibrium
            expect(smc.getCurrentZone(185)).to.equal(
                'Equilibrium',
                'At 85% should be Equilibrium with 5% zones',
            )

            // At 190 (still below 95%) should be Equilibrium
            expect(smc.getCurrentZone(190)).to.equal(
                'Equilibrium',
                'At 90% should be Equilibrium with 5% zones',
            )
        })

        it('should NOT classify 15% as discount (old 15% threshold)', () => {
            // Range: 100 - 200
            const candles = [
                { high: 150, low: 100, open: 120, close: 140 },
                { high: 200, low: 140, open: 140, close: 180 },
                { high: 190, low: 150, open: 180, close: 170 },
            ]

            const baseTime = Date.now()
            for (let i = 0; i < candles.length; i++) {
                smc.update(
                    candles[i].high,
                    candles[i].low,
                    candles[i].open,
                    candles[i].close,
                    baseTime + i * 60000,
                )
            }

            // Old 15% threshold would have discount at <= 115
            // New 5% threshold has discount at <= 105

            // At 115 (which would be discount in old system) should be Equilibrium
            expect(smc.getCurrentZone(115)).to.equal(
                'Equilibrium',
                'At 15% should be Equilibrium with 5% zones',
            )

            // At 110 (still above 5%) should be Equilibrium
            expect(smc.getCurrentZone(110)).to.equal(
                'Equilibrium',
                'At 10% should be Equilibrium with 5% zones',
            )
        })
    })

    describe('Zone Calculations with Different Ranges', () => {
        it('should calculate 5% zones correctly for small ranges', () => {
            // Small range: 90 - 110 = 20
            const candles = [
                { high: 100, low: 90, open: 95, close: 98 }, // Low at 90
                { high: 110, low: 100, open: 98, close: 105 }, // High at 110
                { high: 108, low: 95, open: 105, close: 100 },
            ]

            const baseTime = Date.now()
            for (let i = 0; i < candles.length; i++) {
                smc.update(
                    candles[i].high,
                    candles[i].low,
                    candles[i].open,
                    candles[i].close,
                    baseTime + i * 60000,
                )
            }

            // Range: 20
            // Premium: >= 90 + 20*0.95 = 109
            // Discount: <= 90 + 20*0.05 = 91

            expect(smc.getCurrentZone(109)).to.equal('Premium', 'At 109 should be Premium')
            expect(smc.getCurrentZone(108)).to.equal('Equilibrium', 'At 108 should be Equilibrium')
            expect(smc.getCurrentZone(100)).to.equal('Equilibrium', 'At 100 should be Equilibrium')
            expect(smc.getCurrentZone(92)).to.equal('Equilibrium', 'At 92 should be Equilibrium')
            expect(smc.getCurrentZone(91)).to.equal('Discount', 'At 91 should be Discount')
        })

        it('should calculate 5% zones correctly for large ranges', () => {
            // Large range: 1000 - 2000 = 1000
            const candles = [
                { high: 1500, low: 1000, open: 1200, close: 1400 }, // Low at 1000
                { high: 2000, low: 1400, open: 1400, close: 1800 }, // High at 2000
                { high: 1900, low: 1500, open: 1800, close: 1700 },
            ]

            const baseTime = Date.now()
            for (let i = 0; i < candles.length; i++) {
                smc.update(
                    candles[i].high,
                    candles[i].low,
                    candles[i].open,
                    candles[i].close,
                    baseTime + i * 60000,
                )
            }

            // Range: 1000
            // Premium: >= 1000 + 1000*0.95 = 1950
            // Discount: <= 1000 + 1000*0.05 = 1050

            expect(smc.getCurrentZone(1950)).to.equal('Premium', 'At 1950 should be Premium')
            expect(smc.getCurrentZone(1949)).to.equal(
                'Equilibrium',
                'At 1949 should be Equilibrium',
            )
            expect(smc.getCurrentZone(1500)).to.equal(
                'Equilibrium',
                'At 1500 should be Equilibrium',
            )
            expect(smc.getCurrentZone(1051)).to.equal(
                'Equilibrium',
                'At 1051 should be Equilibrium',
            )
            expect(smc.getCurrentZone(1050)).to.equal('Discount', 'At 1050 should be Discount')
        })

        it('should handle asymmetric ranges correctly', () => {
            // Asymmetric range: 50 - 250 = 200
            const candles = [
                { high: 150, low: 50, open: 100, close: 120 }, // Low at 50
                { high: 250, low: 120, open: 120, close: 200 }, // High at 250
                { high: 240, low: 180, open: 200, close: 210 },
            ]

            const baseTime = Date.now()
            for (let i = 0; i < candles.length; i++) {
                smc.update(
                    candles[i].high,
                    candles[i].low,
                    candles[i].open,
                    candles[i].close,
                    baseTime + i * 60000,
                )
            }

            // Range: 200
            // Premium: >= 50 + 200*0.95 = 240
            // Discount: <= 50 + 200*0.05 = 60

            expect(smc.getCurrentZone(240)).to.equal('Premium', 'At 240 should be Premium')
            expect(smc.getCurrentZone(239)).to.equal('Equilibrium', 'At 239 should be Equilibrium')
            expect(smc.getCurrentZone(150)).to.equal('Equilibrium', 'At 150 should be Equilibrium')
            expect(smc.getCurrentZone(61)).to.equal('Equilibrium', 'At 61 should be Equilibrium')
            expect(smc.getCurrentZone(60)).to.equal('Discount', 'At 60 should be Discount')
        })
    })

    describe('Zone Trailing Updates', () => {
        it('should update zones as trailing extremes change', () => {
            // Initial range
            smc.update(120, 100, 110, 115, 1000) // Range: 100-120

            // Premium: >= 119, Discount: <= 101
            expect(smc.getCurrentZone(119)).to.equal('Premium')
            expect(smc.getCurrentZone(101)).to.equal('Discount')

            // New high extends range
            smc.update(150, 110, 115, 140, 2000) // Range: 100-150

            // Premium: >= 147.5, Discount: <= 102.5
            expect(smc.getCurrentZone(119)).to.equal(
                'Equilibrium',
                'Old premium level now equilibrium',
            )
            expect(smc.getCurrentZone(148)).to.equal('Premium', 'New premium level')

            // New low extends range
            smc.update(145, 80, 140, 90, 3000) // Range: 80-150

            // Premium: >= 146.5, Discount: <= 83.5
            expect(smc.getCurrentZone(101)).to.equal(
                'Equilibrium',
                'Old discount level now equilibrium',
            )
            expect(smc.getCurrentZone(83)).to.equal('Discount', 'New discount level')
        })

        it('should maintain zones when extremes are updated on same side', () => {
            // Initial range
            smc.update(120, 100, 110, 115, 1000) // Range: 100-120

            const zone1 = smc.getCurrentZone(119) // Premium

            // Update high (extends top)
            smc.update(125, 110, 115, 122, 2000) // Range: 100-125

            // 119 should now be equilibrium because premium moved to 123.75
            const zone2 = smc.getCurrentZone(119)
            expect(zone2).to.equal('Equilibrium', 'Zone classification updated with new extreme')
        })
    })

    describe('getCurrentZoneTraillings()', () => {
        it('should return correct 5% zone thresholds', () => {
            // Establish range: 100 - 200
            const candles = [
                { high: 150, low: 100, open: 120, close: 140 },
                { high: 200, low: 140, open: 140, close: 180 },
                { high: 190, low: 150, open: 180, close: 170 },
            ]

            const baseTime = Date.now()
            for (let i = 0; i < candles.length; i++) {
                smc.update(
                    candles[i].high,
                    candles[i].low,
                    candles[i].open,
                    candles[i].close,
                    baseTime + i * 60000,
                )
            }

            const trailings = smc.getCurrentZoneTraillings()

            expect(trailings.top).to.equal(200)
            expect(trailings.bottom).to.equal(100)

            // Premium threshold: 100 + (200-100)*0.95 = 195
            expect(trailings.premiumThreshold).to.equal(195, 'Premium at 95%')

            // Discount threshold: 100 + (200-100)*0.05 = 105
            expect(trailings.discountThreshold).to.equal(105, 'Discount at 5%')
        })

        it('should provide thresholds that match getCurrentZone() behavior', () => {
            // Establish range
            smc.update(120, 80, 100, 110, 1000) // Range: 80-120

            const trailings = smc.getCurrentZoneTraillings()

            // Verify premium threshold matches zone classification
            const justAbovePremium = trailings.premiumThreshold + 0.1
            const justBelowPremium = trailings.premiumThreshold - 0.1

            expect(smc.getCurrentZone(justAbovePremium)).to.equal('Premium')
            expect(smc.getCurrentZone(justBelowPremium)).to.equal('Equilibrium')

            // Verify discount threshold matches zone classification
            const justAboveDiscount = trailings.discountThreshold + 0.1
            const justBelowDiscount = trailings.discountThreshold - 0.1

            expect(smc.getCurrentZone(justAboveDiscount)).to.equal('Equilibrium')
            expect(smc.getCurrentZone(justBelowDiscount)).to.equal('Discount')
        })
    })

    describe('Pine Script Compliance', () => {
        it('should match Pine Script formula: premium = 0.95*top + 0.05*bottom', () => {
            // From Pine Script line 754
            const top = 200
            const bottom = 100

            smc.update(150, 100, 120, 140, 1000)
            smc.update(200, 140, 140, 180, 2000)

            const trailings = smc.getCurrentZoneTraillings()

            // Pine formula: 0.95*top + 0.05*bottom
            const expectedPremium = 0.95 * top + 0.05 * bottom // = 190 + 5 = 195
            // Our formula: bottom + range * 0.95 = 100 + 100*0.95 = 195

            expect(trailings.premiumThreshold).to.equal(expectedPremium)
        })

        it('should match Pine Script formula: discount = 0.95*bottom + 0.05*top', () => {
            // From Pine Script line 759
            const top = 200
            const bottom = 100

            smc.update(150, 100, 120, 140, 1000)
            smc.update(200, 140, 140, 180, 2000)

            const trailings = smc.getCurrentZoneTraillings()

            // Pine formula: 0.95*bottom + 0.05*top
            const expectedDiscount = 0.95 * bottom + 0.05 * top // = 95 + 10 = 105
            // Our formula: bottom + range * 0.05 = 100 + 100*0.05 = 105

            expect(trailings.discountThreshold).to.equal(expectedDiscount)
        })

        it('should leave 90% equilibrium zone (not 70% as with 15%)', () => {
            const top = 200
            const bottom = 100
            const range = top - bottom // 100

            smc.update(150, 100, 120, 140, 1000)
            smc.update(200, 140, 140, 180, 2000)

            const trailings = smc.getCurrentZoneTraillings()

            // Equilibrium zone size
            const equilibriumSize = trailings.premiumThreshold - trailings.discountThreshold // 195 - 105 = 90

            // Should be 90% of total range
            expect(equilibriumSize).to.equal(range * 0.9)

            // Old 15% system would have 70% equilibrium (85% - 15% = 70%)
            expect(equilibriumSize).to.not.equal(range * 0.7)
        })
    })
})
