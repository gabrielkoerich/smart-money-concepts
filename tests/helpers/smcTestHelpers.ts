import { SmartMoneyConcepts } from '../../src/index.js'

/**
 * Build initial market structure to establish swing pivots
 * This is required after removing auto-initialization of pivots
 *
 * @param smc - SmartMoneyConcepts instance
 * @param direction - Initial trend direction ('up' or 'down')
 * @param candleCount - Number of candles to generate (default: 60)
 * @returns The next timestamp to use for subsequent candles
 */
export function buildInitialStructure(
    smc: SmartMoneyConcepts,
    direction: 'up' | 'down' = 'down',
    candleCount: number = 60,
): number {
    const baseTime = Date.now()
    const startPrice = direction === 'up' ? 50 : 200

    // Create strong oscillating pattern with clear trend to establish swing structure
    // This ensures proper swing highs and lows are detected
    for (let i = 0; i < candleCount; i++) {
        const trend = direction === 'up' ? i * 1.5 : -i * 1.5 // Stronger trend
        const oscillation = Math.sin(i / 3) * 5 // Larger oscillations for clearer swings
        const price = startPrice + trend + oscillation

        const open = direction === 'up' ? price - 2 : price + 2
        const close = direction === 'up' ? price + 2 : price - 2

        smc.update(
            price + 5, // high
            price - 5, // low
            open,
            close,
            baseTime + i * 60 * 1000,
            1000 + i * 10, // volume
        )
    }

    return baseTime + candleCount * 60 * 1000
}

/**
 * Helper to get SMC config with smaller swingsLengthInput for faster testing
 */
export function getTestSMCConfig() {
    return {
        swingsLengthInput: 3, // Very small for testing to detect swings faster
    }
}
