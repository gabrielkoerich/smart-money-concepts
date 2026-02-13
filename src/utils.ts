import { Candle } from './types.js'
import logger from './logger.js'
import type { SmartMoneyConcepts } from './SmartMoneyConcepts.js'

export const buildCandles = (
    highs: number[],
    lows: number[],
    opens: number[],
    closes: number[],
    times: number[],
    volumes: number[],
): Candle[] =>
    highs.map((high, i) => {
        return {
            time: times[i],
            open: opens[i],
            high,
            low: lows[i],
            close: closes[i],
            volume: volumes[i],
        }
    })

export const validateInputs = (
    high: number,
    low: number,
    open: number,
    close: number,
    time: number,
    volume: number,
    requireVolumeConfirmation: boolean,
): boolean => {
    // Check for valid numbers
    if (
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(open) ||
        !Number.isFinite(close) ||
        !Number.isFinite(time) ||
        !Number.isFinite(volume)
    ) {
        return false
    }

    // Volume must be non-negative
    if (volume < 0) {
        return false
    }

    // If volume confirmation is strictly required but no volume data provided
    if (requireVolumeConfirmation && volume === 0) {
        logger.warn('Warning: Volume data missing but volume confirmation required')
        // Still allow processing with warning for backward compatibility
    }

    // Check basic logical price relationships
    if (high < low) {
        return false
    }

    // For negative values or zero time, allow them (for testing scenarios)
    if (high < 0 || low < 0 || open < 0 || close < 0) {
        return false
    }

    return true
}

/**
 * Pretty print debug information to console
 */
export function printDebugInfo(smc: SmartMoneyConcepts, currentPrice?: number): void {
    const debugInfo = smc.getDebugInfo(currentPrice)

    logger.debug('=== SMART MONEY CONCEPTS DEBUG INFO ===')

    logger.debug('MARKET STRUCTURE & BIASES:')
    logger.debug(`  Swing Trend Bias: ${debugInfo.biases.swingTrendBias}`)
    logger.debug(`  Internal Trend Bias: ${debugInfo.biases.internalTrendBias}`)

    logger.debug('PREMIUM/DISCOUNT ZONES:')
    logger.debug(`  Current Zone: ${debugInfo.currentZone.zone}`)
    logger.debug(`  Current Price: ${debugInfo.currentZone.price}`)
    logger.debug(`  Top: ${debugInfo.currentZone.trailing.top}`)
    logger.debug(`  Bottom: ${debugInfo.currentZone.trailing.bottom}`)
    logger.debug(`  Range: ${debugInfo.currentZone.trailing.range.toFixed(4)}`)
    logger.debug(`  Premium Threshold (85%): ${debugInfo.currentZone.trailing.premiumThreshold}`)
    logger.debug(`  Discount Threshold (15%): ${debugInfo.currentZone.trailing.discountThreshold}`)

    logger.debug('ORDER BLOCKS SUMMARY:')
    logger.debug(`  Total Swing Order Blocks: ${debugInfo.orderBlocks.swing.total}`)
    logger.debug(`    Bullish: ${debugInfo.orderBlocks.swing.bullish.length}`)
    logger.debug(`    Bearish: ${debugInfo.orderBlocks.swing.bearish.length}`)
    logger.debug(`  Total Internal Order Blocks: ${debugInfo.orderBlocks.internal.total}`)
    logger.debug(`    Bullish: ${debugInfo.orderBlocks.internal.bullish.length}`)
    logger.debug(`    Bearish: ${debugInfo.orderBlocks.internal.bearish.length}`)

    if (debugInfo.orderBlocks.swing.total > 0) {
        logger.debug('SWING ORDER BLOCKS (Latest 5):')
        const allSwingBlocks = [
            ...debugInfo.orderBlocks.swing.bullish.map((b: any) => ({ ...b, color: 'bull' })),
            ...debugInfo.orderBlocks.swing.bearish.map((b: any) => ({ ...b, color: 'bear' })),
        ].slice(0, 5)

        allSwingBlocks.forEach((block: any) => {
            logger.debug(
                `  ${block.color} ${block.bias} | H: ${block.high} | L: ${block.low} | Range: ${block.range.toFixed(4)} | Mid: ${block.midpoint.toFixed(4)}`,
            )
        })
    }

    if (debugInfo.orderBlocks.internal.total > 0) {
        logger.debug('INTERNAL ORDER BLOCKS (Latest 5):')
        const allInternalBlocks = [
            ...debugInfo.orderBlocks.internal.bullish.map((b: any) => ({ ...b, color: 'bull' })),
            ...debugInfo.orderBlocks.internal.bearish.map((b: any) => ({ ...b, color: 'bear' })),
        ].slice(0, 5)

        allInternalBlocks.forEach((block: any) => {
            logger.debug(
                `  ${block.color} ${block.bias} | H: ${block.high} | L: ${block.low} | Range: ${block.range.toFixed(4)} | Mid: ${block.midpoint.toFixed(4)}`,
            )
        })
    }

    if (debugInfo.fairValueGaps.total > 0) {
        logger.debug('FAIR VALUE GAPS:')
        logger.debug(
            `  Total FVGs: ${debugInfo.fairValueGaps.total} (Bullish: ${debugInfo.fairValueGaps.bullish.length}, Bearish: ${debugInfo.fairValueGaps.bearish.length})`,
        )
        debugInfo.fairValueGaps.gaps.slice(0, 3).forEach((gap: any) => {
            logger.debug(
                `  ${gap.bias} | Top: ${gap.top} | Bottom: ${gap.bottom} | Range: ${gap.range.toFixed(4)}`,
            )
        })
    }

    logger.debug('=== END DEBUG INFO ===')
}
