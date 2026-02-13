import {
    Alerts,
    Candle,
    ConfluenceComponents,
    EqualDisplay,
    FairValueGap,
    LiquidityGrab,
    MarketMakerAnalysis,
    MarketPhase,
    OrderBlock,
    OrderBlockType,
    OrderFlowSignal,
    OrderFlowType,
    Pivot,
    SmartMoneyConceptsConfig,
    TradingSession,
    TrailingExtremes,
    Trend,
    TrendBias,
    Zone,
} from './types.js'
import logger from './logger.js'
import * as ta from './ta.js'
import { ATR } from './ta.js'
import { buildCandles, validateInputs } from './utils.js'

export class SmartMoneyConcepts {
    // BEARISH_LEG = 0, BULLISH_LEG = 1
    private readonly BEARISH_LEG = 0
    private readonly BULLISH_LEG = 1

    private readonly NEUTRAL = 0
    private readonly BULLISH = 1
    private readonly BEARISH = -1

    // Configuration parameters
    private swingsLengthInput: number = 50 // Keep default for compatibility, use config to increase for production
    private atrPeriod: number = 200 // ta.atr(200)

    // Mitigation options
    private orderBlockFilterInput: 'Atr' | 'Cumulative Mean Range' = 'Atr'
    private orderBlockMitigationInput: 'Close' | 'High/Low' = 'Close'
    private internalFilterConfluenceInput: boolean = false
    private equalHighsLowsLengthInput: number = 3
    private equalHighsLowsThresholdInput: number = 0.1

    // Phase 1 - ICT Methodology Enhancements
    private onlyTradeFreshOBs: boolean = true // Default: only fresh OBs
    private maxOBMitigations: number = 1 // Default: allow first mitigation only
    private enableCOSD: boolean = true // Default: enabled
    private classifyOrderBlocks: boolean = true // Default: enabled

    // Phase 3A - ICT 5-Criteria HP OB Validation
    private strict5CriteriaValidation: boolean = false // Default: relaxed (2 criteria)
    private requireFVGForHP: boolean = false // Default: FVG optional
    private requireCOSDForHP: boolean = false // Default: COSD optional

    // Phase 3C - ATR-based OB Size Filtering
    private minOBSizeATRMultiplier: number = 0.3 // Min OB size (30% of ATR)
    private maxOBSizeATRMultiplier: number = 2.0 // Max OB size (200% of ATR)
    private enableOBSizeFilter: boolean = false // Default: disabled for backward compatibility

    // Technical indicators
    private atr: ATR = new ATR(this.atrPeriod)

    // Memory management constants
    private readonly MAX_HISTORY_LENGTH = 2500
    private readonly MAX_ORDER_BLOCKS = 100
    private readonly MAX_FAIR_VALUE_GAPS = 50

    // Performance monitoring
    private performanceMetrics = {
        updateCount: 0,
        totalUpdateTime: 0,
        averageUpdateTime: 0,
        lastUpdateTime: 0,
        peakUpdateTime: 0,
    }

    // Data structures
    private alerts: Alerts = new Alerts()
    liquidityGrab: boolean = false
    swingHigh: Pivot = new Pivot()
    swingLow: Pivot = new Pivot()
    internalHigh: Pivot = new Pivot()
    internalLow: Pivot = new Pivot()
    private equalHigh: Pivot = new Pivot()
    private equalHighDisplay: EqualDisplay = new EqualDisplay()
    private equalLow: Pivot = new Pivot()
    private equalLowDisplay: EqualDisplay = new EqualDisplay()
    private swingTrend: Trend = new Trend()
    private internalTrend: Trend = new Trend()
    fairValueGaps: FairValueGap[] = []

    /**
     * Leg state keyed by structure size, mirroring `leg(size)` with a single leg per size.
     * Maps size -> current leg value (0 = bearish, 1 = bullish).
     */
    private legValues: Map<number, number> = new Map()

    /**
     * Previous leg values used to emulate ta.change(leg) for each size.
     * Maps size -> previous leg value.
     */
    private prevLegValues: Map<number, number> = new Map()
    private parsedHighs: number[] = []
    private parsedLows: number[] = []
    private highs: number[] = []
    private lows: number[] = []
    private opens: number[] = []
    private closes: number[] = []
    private times: number[] = []
    private trailing: TrailingExtremes = new TrailingExtremes()
    swingOrderBlocks: OrderBlock[] = []
    internalOrderBlocks: OrderBlock[] = []
    private currentBarIndex: number = 0
    private isNewBar: boolean = false
    private lastBarIndex: number = 0
    private initialTime: number = 0

    // Volume analysis
    private volumes: number[] = []
    private averageVolume: number = 0
    private volumeThreshold: number = 1.2 // Volume spike threshold (reduced to be more lenient)
    private requireVolumeConfirmation: boolean = false // Volume optional by default for backward compatibility
    private liquidityGrabs: LiquidityGrab[] = []
    private readonly MAX_LIQUIDITY_GRABS = 20

    // Session analysis
    private currentSession: TradingSession = TradingSession.UNKNOWN
    private sessionHighVolume: boolean = false
    private sessionMajorMove: boolean = false

    // Market Maker Model
    private marketMakerAnalysis: MarketMakerAnalysis = {
        currentPhase: MarketPhase.ACCUMULATION,
        phaseConfidence: 50,
        expectedDirection: 'Sideways',
        targetZones: [],
        timeInPhase: 0,
        institutionalActivity: 'Medium',
        volumeProfile: {
            averageVolume: 0,
            spikeThreshold: 1.5,
            institutionalThreshold: 2.0,
        },
    }

    // Order Flow Analysis
    private orderFlowSignals: OrderFlowSignal[] = []
    private readonly MAX_ORDER_FLOW_SIGNALS = 50

    // Unicorn Setup tracking - prevent duplicate alerts for same breaker+FVG pair
    private detectedUnicornPairs: Set<string> = new Set()

    // Confluence scoring system
    private lastConfluenceScore: number = 0
    private confluenceComponents: ConfluenceComponents = {
        structureAlignment: 0,
        volumeConfirmation: 0,
        zoneAlignment: 0,
        sessionTiming: 0,
        liquidityContext: 0,
        marketMakerAlignment: 0,
    }

    // Technical analysis variables
    private bearishOrderBlockMitigationSource: number[] = []
    private bullishOrderBlockMitigationSource: number[] = []
    // private volatilityMeasure: number = 0
    private volatilityMeasure: number = 0
    private highVolatilityBar: boolean = false
    private parsedHigh: number = 0
    private parsedLow: number = 0

    /**
     * Creates a new SmartMoneyConceptsV2 instance with default or custom settings
     */
    constructor(config?: Partial<SmartMoneyConceptsConfig>) {
        this.swingsLengthInput = config?.swingsLengthInput ?? this.swingsLengthInput
        this.atrPeriod = config?.atrPeriod ?? this.atrPeriod
        this.orderBlockFilterInput = config?.orderBlockFilterInput ?? this.orderBlockFilterInput
        this.orderBlockMitigationInput =
            config?.orderBlockMitigationInput ?? this.orderBlockMitigationInput
        this.internalFilterConfluenceInput =
            config?.internalFilterConfluenceInput ?? this.internalFilterConfluenceInput
        this.equalHighsLowsLengthInput =
            config?.equalHighsLowsLengthInput ?? this.equalHighsLowsLengthInput
        this.equalHighsLowsThresholdInput =
            config?.equalHighsLowsThresholdInput ?? this.equalHighsLowsThresholdInput

        // Volume configuration
        this.volumeThreshold = config?.volumeThresholdInput ?? this.volumeThreshold
        this.requireVolumeConfirmation = config?.requireVolumeConfirmation ?? false

        // Phase 1 - ICT Methodology Enhancements
        this.onlyTradeFreshOBs = config?.onlyTradeFreshOBs ?? this.onlyTradeFreshOBs
        this.maxOBMitigations = config?.maxOBMitigations ?? this.maxOBMitigations
        this.enableCOSD = config?.enableCOSD ?? this.enableCOSD
        this.classifyOrderBlocks = config?.classifyOrderBlocks ?? this.classifyOrderBlocks

        // Phase 3A - ICT 5-Criteria HP OB Validation
        this.strict5CriteriaValidation =
            config?.strict5CriteriaValidation ?? this.strict5CriteriaValidation
        this.requireFVGForHP = config?.requireFVGForHP ?? this.requireFVGForHP
        this.requireCOSDForHP = config?.requireCOSDForHP ?? this.requireCOSDForHP

        // Phase 3C - ATR-based OB Size Filtering
        this.minOBSizeATRMultiplier = config?.minOBSizeATRMultiplier ?? this.minOBSizeATRMultiplier
        this.maxOBSizeATRMultiplier = config?.maxOBSizeATRMultiplier ?? this.maxOBSizeATRMultiplier
        this.enableOBSizeFilter = config?.enableOBSizeFilter ?? this.enableOBSizeFilter

        // Initialize ATR indicator
        this.atr = new ATR(this.atrPeriod)
    }

    /**
     * Update data with new bar data including volume analysis
     */
    public update(
        high: number,
        low: number,
        open: number,
        close: number,
        time: number,
        volume: number = 0, // Allow zero volume for backward compatibility
    ): Alerts {
        const startTime = performance.now()

        try {
            // Input validation - volume can be zero for backward compatibility
            if (
                !validateInputs(
                    high,
                    low,
                    open,
                    close,
                    time,
                    volume,
                    this.requireVolumeConfirmation,
                )
            ) {
                logger.warn('Invalid market data inputs detected')

                return this.alerts
            }

            // Ensure non-negative volume with minimum value to avoid division by zero
            volume = Math.max(volume, 0.00001)

            // Check if we're updating an existing candle (same timestamp as last)
            const isUpdatingExistingCandle =
                this.times.length > 0 && this.times[this.times.length - 1] === time

            if (isUpdatingExistingCandle) {
                logger.debug(
                    `[SMC] Updating existing candle from ${time}, index: ${this.times.length - 1}`,
                )

                // Update existing candle in place
                return this.updateLastBar(high, low, open, close, time, volume)
            }

            // New candle - proceed with normal update logic
            logger.debug(
                `[SMC] Updating new candle: ${time}, low ${low}, high ${high}, open ${open}, close ${close}, volume ${volume}`,
            )

            // Reset alerts for this bar
            this.alerts = new Alerts()

            // Update ATR indicator with candle data
            if (this.atr) {
                this.atr.update({ high, low, close }, false)
            }

            // Calculate the ATR and volatility measures
            this.updateVolatilityMeasures(high, low)

            // Update parsed high/low based on volatility
            this.highVolatilityBar =
                this.volatilityMeasure > 0 && high - low >= 2 * this.volatilityMeasure

            this.parsedHigh = this.highVolatilityBar ? low : high
            this.parsedLow = this.highVolatilityBar ? high : low

            // Store current values in arrays
            this.parsedHighs.push(this.parsedHigh)
            this.parsedLows.push(this.parsedLow)

            // Store each value in arrays
            this.highs.push(high)
            this.lows.push(low)
            this.opens.push(open)
            this.closes.push(close)
            this.times.push(time)
            this.volumes.push(volume)

            // Update volume analysis
            this.updateVolumeAnalysis()

            // Update session analysis
            this.updateSessionAnalysis(time)

            // Update Market Maker analysis
            this.updateMarketMakerAnalysis(high, low, close, volume, time)

            // Detect order flow patterns
            this.detectOrderFlow(high, low, close, volume, time)

            // Memory management: trim arrays if they exceed maximum length
            this.trimHistoryArrays()

            // Update order block mitigation sources
            if (this.orderBlockMitigationInput === 'Close') {
                this.bearishOrderBlockMitigationSource.push(close)
                this.bullishOrderBlockMitigationSource.push(close)
            } else {
                this.bearishOrderBlockMitigationSource.push(high)
                this.bullishOrderBlockMitigationSource.push(low)
            }

            // Process data
            this.processCurrentStructure(high, low, open, close, time)

            // Update bar indices
            this.lastBarIndex = this.currentBarIndex

            // If it's the first bar, initialize time
            if (this.currentBarIndex === 0) {
                this.initialTime = time
            }

            this.isNewBar = this.currentBarIndex != this.lastBarIndex
            this.currentBarIndex++

            // Update performance metrics
            const endTime = performance.now()
            const updateTime = endTime - startTime

            this.updatePerformanceMetrics(updateTime)

            // Calculate confluence score for this candle
            this.calculateConfluenceScore()
        } catch (error) {
            logger.error((error as Error).message, { error: (error as Error).stack })
        }

        return this.alerts
    }

    /**
     * Update the last bar in place (for real-time candle updates)
     * This is more efficient than reprocessing all candles when only the current candle is updating
     */
    public updateLastBar(
        high: number,
        low: number,
        open: number,
        close: number,
        time: number,
        volume: number = 0,
    ): Alerts {
        const startTime = performance.now()

        try {
            // Input validation
            if (
                !validateInputs(
                    high,
                    low,
                    open,
                    close,
                    time,
                    volume,
                    this.requireVolumeConfirmation,
                )
            ) {
                logger.warn('Invalid market data inputs detected in updateLastBar')
                return this.alerts
            }

            // Ensure we have at least one bar to update
            if (this.currentBarIndex === 0 || this.highs.length === 0) {
                // No existing bar, treat as new bar
                return this.update(high, low, open, close, time, volume)
            }

            // Ensure non-negative volume
            volume = Math.max(volume, 0.00001)

            // Reset alerts for this bar
            this.alerts = new Alerts()

            // Get the last index (current bar being updated)
            const barIndex = this.currentBarIndex

            // Update ATR indicator with candle data
            if (this.atr) {
                this.atr.update({ high, low, close }, false)
            }

            // Calculate the ATR and volatility measures
            this.updateVolatilityMeasures(high, low)

            // Update parsed high/low based on volatility
            this.highVolatilityBar =
                this.volatilityMeasure > 0 && high - low >= 2 * this.volatilityMeasure

            this.parsedHigh = this.highVolatilityBar ? low : high
            this.parsedLow = this.highVolatilityBar ? high : low

            // Replace last values in all arrays
            this.parsedHighs[barIndex] = this.parsedHigh
            this.parsedLows[barIndex] = this.parsedLow
            this.highs[barIndex] = high
            this.lows[barIndex] = low
            this.opens[barIndex] = open
            this.closes[barIndex] = close
            this.times[barIndex] = time
            this.volumes[barIndex] = volume

            // Update volume analysis
            this.updateVolumeAnalysis()

            // Update session analysis
            this.updateSessionAnalysis(time)

            // Update Market Maker analysis
            this.updateMarketMakerAnalysis(high, low, close, volume, time, true)

            // Detect order flow patterns
            this.detectOrderFlow(high, low, close, volume, time)

            // Update order block mitigation sources
            if (this.orderBlockMitigationInput === 'Close') {
                this.bearishOrderBlockMitigationSource[barIndex] = close
                this.bullishOrderBlockMitigationSource[barIndex] = close
            } else {
                this.bearishOrderBlockMitigationSource[barIndex] = high
                this.bullishOrderBlockMitigationSource[barIndex] = low
            }

            // Mark as not a new bar (updating existing)
            this.isNewBar = false

            // Process current structure with updated values
            // This will recalculate pivots, order blocks, FVGs, etc. with the new bar values
            this.processCurrentStructure(high, low, open, close, time)

            // Update performance metrics
            const endTime = performance.now()
            const updateTime = endTime - startTime
            this.updatePerformanceMetrics(updateTime)

            // Calculate confluence score for this candle
            this.calculateConfluenceScore()
        } catch (error) {
            logger.error(`Error in updateLastBar: ${(error as Error).message}`, {
                error: (error as Error).stack,
            })
        }

        return this.alerts
    }

    /**
     * Process the current structure
     */
    private processCurrentStructure(
        high: number,
        low: number,
        open: number,
        close: number,
        time: number,
    ): void {
        // Update trailing extremes
        this.updateTrailingExtremes(high, low, time)

        // Delete Fair Value Gaps
        this.deleteFairValueGaps(high, low)

        // Get current structure for swing structure
        this.getCurrentStructure(this.swingsLengthInput, false)

        // Get current structure for internal structure
        this.getCurrentStructure(5, false, true)

        // Get current structure for equal highs/lows
        this.getCurrentStructure(this.equalHighsLowsLengthInput, true)

        // Process internal structure (authoritative)
        this.analyzeStructure(true, close)

        // Process swing structure (authoritative)
        this.analyzeStructure(false, close)

        // console.log('trendBias:', this.getTrendBias())

        // Clean up mitigated order blocks
        this.deleteOrderBlocks(true) // Internal order blocks
        this.deleteOrderBlocks(false) // Swing order blocks

        // Process fair value gaps
        this.detectFairValueGap(high, low, open, close)

        // Phase 2: Detect The Unicorn setup (Breaker + FVG alignment)
        this.detectUnicornSetup()
    }

    /**
     * Update volatility measures
     */
    private updateVolatilityMeasures(high: number, low: number): void {
        // Use library ATR (proper EMA-based calculation)
        if (this.orderBlockFilterInput === 'Atr' && this.atr.isStable) {
            this.volatilityMeasure = this.atr.getResult() || 0
        } else {
            this.volatilityMeasure =
                ta.cumulativeMeanRange(this.buildCandles(), this.atrPeriod) || 0
        }
    }

    /**
     * Determine market leg direction
     * leg(size) implementation:
     * - Returns 0 (bearish leg) or 1 (bullish leg)
     * - Uses one persisted leg value per size (keyed in legValues)
     * - Pattern:
     *   newLegHigh = high[size] > highest(high, size)
     *   newLegLow  = low[size]  < lowest(low, size)
     *   if newLegHigh => leg := BEARISH_LEG
     *   else if newLegLow => leg := BULLISH_LEG
     */
    private leg(size: number): number {
        if (this.highs.length <= size || size < 1) {
            logger.error(`Invalid size parameter: ${size}`)

            return this.getLegValue(size)
        }

        let highest = ta.highest(this.highs, size)
        let lowest = ta.lowest(this.lows, size)

        if (!highest || !lowest) {
            return this.getLegValue(size)
        }

        // Pivot bar index for high[size]/low[size]
        const pivotIndex = this.highs.length - 1 - size
        const barHigh = this.highs[pivotIndex]
        const barLow = this.lows[pivotIndex]

        const newLegHigh = barHigh > highest
        const newLegLow = barLow < lowest

        let legValue = this.getLegValue(size)

        if (newLegHigh) {
            legValue = this.BEARISH_LEG
        } else if (newLegLow) {
            legValue = this.BULLISH_LEG
        }

        this.setLegValue(size, legValue)

        return legValue
    }

    /**
     * Get persisted leg value for a given size.
     * Mirrors single `var leg` per size.
     */
    private getLegValue(size: number): number {
        const stored = this.legValues.get(size)
        return stored ?? this.BEARISH_LEG
    }

    /**
     * Set persisted leg value for a given size.
     */
    private setLegValue(size: number, value: number): void {
        this.legValues.set(size, value)
    }

    /**
     *
     * Detect start of new leg - ta.change(leg) != 0
     * startOfNewLeg(int leg) => ta.change(leg) != 0
     * Here ta.change(leg) is modeled as (leg - prevLeg) for this size.
     */
    private startOfNewLeg(leg: number, size: number): boolean {
        // ta.change (built-in function) +5 overloads
        // Compares the current source value to its value length bars ago and returns the difference.
        // Syntax
        // ta.change(source) → series int
        // Returns
        // The difference between the values when they are numerical.

        const prevLeg = this.getPrevLegValue(size)
        return leg !== prevLeg
    }

    /**
     * Detect start of bearish leg - ta.change(leg) == -1
     * Transition from BULLISH_LEG (1) to BEARISH_LEG (0) = -1
     */
    private startOfBearishLeg(leg: number, size: number): boolean {
        const prevLeg = this.getPrevLegValue(size)
        const change = leg - prevLeg
        return change === -1
    }

    /**
     * Detect start of bullish leg - ta.change(leg) == +1
     * Transition from BEARISH_LEG (0) to BULLISH_LEG (1) = +1
     */
    private startOfBullishLeg(leg: number, size: number): boolean {
        const prevLeg = this.getPrevLegValue(size)
        const change = leg - prevLeg
        return change === 1
    }

    /**
     * Get previous leg value for a given size.
     * Used to emulate ta.change(leg) on a per-size basis.
     */
    private getPrevLegValue(size: number): number {
        const stored = this.prevLegValues.get(size)
        return stored ?? this.BEARISH_LEG
    }

    /**
     * Save current leg as previous for next iteration (per size).
     */
    private savePrevLegValue(size: number): void {
        const currentLeg = this.getLegValue(size)
        this.prevLegValues.set(size, currentLeg)
    }

    /**
     * Get current structure for both swing and internal trends
     */
    private getCurrentStructure(
        size: number,
        equalHighLow: boolean = false,
        internal: boolean = false,
    ): void {
        // Check if we have enough data
        if (this.highs.length < size + 1) return

        // Get current leg value (per size, mirroring leg(size))
        const currentLeg = this.leg(size)

        // Check if leg changed (ta.change(leg) != 0)
        const newPivot = this.startOfNewLeg(currentLeg, size)

        if (!newPivot) {
            // Save current leg for next comparison
            this.savePrevLegValue(size)
            return
        }

        // Check direction of change: ta.change(leg) == +1 (bullish), -1 (bearish)
        const pivotLow = this.startOfBullishLeg(currentLeg, size)
        const pivotHigh = this.startOfBearishLeg(currentLeg, size)

        if (pivotLow && pivotHigh) {
            throw new Error('Invalid state: Both high and low pivots detected')
        }

        // Calculate pivot index (same as in leg() function)
        const pivotIndex = this.highs.length - 1 - size

        // Update swing structure
        if (pivotLow) {
            // New pivot detected
            const newLowPivot = equalHighLow
                ? this.equalLow
                : internal
                  ? this.internalLow
                  : this.swingLow

            newLowPivot.lastLevel = newLowPivot.currentLevel
            newLowPivot.currentLevel = this.lows[pivotIndex]
            newLowPivot.crossed = false
            newLowPivot.barTime = this.times[pivotIndex]
            newLowPivot.barIndex = pivotIndex

            if (!equalHighLow && !internal) {
                this.trailing.bottom = newLowPivot.currentLevel
                this.trailing.barTime = newLowPivot.barTime
                this.trailing.barIndex = newLowPivot.barIndex
                this.trailing.lastBottomTime = newLowPivot.barTime
            }

            if (!internal && !equalHighLow) {
                // drawLabel(time[size], p_ivot.currentLevel, p_ivot.currentLevel < p_ivot.lastLevel ? 'LL' : 'HL', swingBullishColor, label.style_label_up)
                // add HL & LL to bars
                // // drawEqualHighLow -> set EqualDisplay
            }
        }

        if (pivotHigh) {
            // New pivot detected
            const newHighPivot = equalHighLow
                ? this.equalHigh
                : internal
                  ? this.internalHigh
                  : this.swingHigh

            if (
                equalHighLow &&
                Math.abs(newHighPivot.currentLevel - this.highs[pivotIndex]) <
                    this.equalHighsLowsThresholdInput * this.volatilityMeasure
            ) {
                // drawEqualHighLow(p_ivot,high[size],size,true)
                // drawEqualHighLow -> set EqualDisplay
                this.equalHighDisplay.active = true
            }

            newHighPivot.lastLevel = newHighPivot.currentLevel
            newHighPivot.currentLevel = this.highs[pivotIndex]
            newHighPivot.crossed = false
            newHighPivot.barTime = this.times[pivotIndex]
            newHighPivot.barIndex = pivotIndex

            if (!equalHighLow && !internal) {
                this.trailing.bottom = newHighPivot.currentLevel
                this.trailing.barTime = newHighPivot.barTime
                this.trailing.barIndex = newHighPivot.barIndex
                this.trailing.lastBottomTime = newHighPivot.barTime
            }

            if (!internal && !equalHighLow) {
                // drawLabel(time[size], p_ivot.currentLevel, p_ivot.currentLevel > p_ivot.lastLevel ? 'HH' : 'LH', swingBearishColor, label.style_label_down)
                // drawLabel -> add HL & LL to bars
                // drawEqualHighLow -> set EqualDisplay
            }
        }

        // Save current leg as previous for next bar (ta.change() comparison)
        this.savePrevLegValue(size)
    }

    /**
     * Analyze market structure and detect order blocks
     */
    private analyzeStructure(internal: boolean, close?: number): void {
        // Determine if bar conditions are met for internal filtering
        let bullishBar = true
        let bearishBar = true

        const lastIndex = this.closes.length - 1
        close = close ?? this.closes[lastIndex]

        if (this.internalFilterConfluenceInput) {
            // Get current bar values
            const high = this.highs[this.highs.length - 1]
            const low = this.lows[this.lows.length - 1]
            const open = this.opens[this.opens.length - 1]

            // Check bar characteristics
            bullishBar = high - Math.max(close, open) > Math.min(close, open - low)
            bearishBar = high - Math.max(close, open) < Math.min(close, open - low)
        }

        // Volume confirmation for structure breaks (disabled for now to ensure alerts)
        // Check if there's volume confirmation (for informational purposes only)
        const hasVolume = this.hasConfirmingVolume(internal)

        // Process high pivot
        const highPivot = internal ? this.internalHigh : this.swingHigh
        const trend = internal ? this.internalTrend : this.swingTrend

        // Check if price crossed above the high pivot
        const extraHighCondition = internal
            ? highPivot.currentLevel !== this.swingHigh.currentLevel && bullishBar
            : true

        // Syntax
        // crossover(x, y) → series[bool]
        // The x-series is defined as having crossed over y-series if the value of x is greater than the value of y and the value of x was less than the value of y on the bar immediately preceding the current bar.
        // Crossover detection: emulate ta.crossover(close, pivot.currentLevel)
        // Uses the same level for previous and current close comparisons, matching behavior.
        const crossOver =
            ta.crossover(this.closes, highPivot.currentLevel) &&
            !highPivot.crossed &&
            extraHighCondition
        // &&
        // highPivot.currentLevel !== 0

        if (crossOver) {
            const isCHoCH = trend.bias === this.BEARISH

            // Phase 1: Detect Change of State of Delivery (COSD)
            const cosdDetected = this.detectCOSD(this.BULLISH, close)
            if (cosdDetected) {
                this.alerts.changeOfStateOfDelivery = true
            }

            // Set appropriate alerts with volume strength
            if (internal) {
                this.alerts.internalBullishCHoCH = isCHoCH
                this.alerts.internalBullishBOS = !isCHoCH
            } else {
                this.alerts.swingBullishCHoCH = isCHoCH
                this.alerts.swingBullishBOS = !isCHoCH
            }

            // Set volume spike alert if volume confirms the structure break
            if (hasVolume) {
                this.alerts.volumeSpike = true
            }

            // Mark pivot as crossed and update trend
            highPivot.crossed = true
            trend.bias = this.BULLISH

            // drawStructure(p_ivot,tag,bullishColor,lineStyle,label.style_label_down,labelSize)

            // Store order block with volume information
            this.storeOrderBlock(highPivot, internal, this.BULLISH)
        }

        // Process low pivot
        const lowPivot = internal ? this.internalLow : this.swingLow

        const extraLowCondition = internal
            ? lowPivot.currentLevel !== this.swingLow.currentLevel && bearishBar
            : true

        // Crossunder detection: emulate ta.crossunder(close, pivot.currentLevel)
        // Uses the same level for previous and current close comparisons, matching behavior.
        const crossedUnder =
            ta.crossunder(this.closes, lowPivot.currentLevel) &&
            !lowPivot.crossed &&
            extraLowCondition
        // &&
        // lowPivot.currentLevel !== 0 // Skip crossover detection if pivot hasn't been initialized yet

        if (crossedUnder) {
            // Phase 1: Detect Change of State of Delivery (COSD)
            const cosdDetected = this.detectCOSD(this.BEARISH, close)
            if (cosdDetected) {
                this.alerts.changeOfStateOfDelivery = true
            }

            // Set volume spike alert if volume confirms the structure break
            if (hasVolume) {
                this.alerts.volumeSpike = true
            }

            const isCHoCH = trend.bias === this.BULLISH

            // Set appropriate alerts with volume strength
            if (internal) {
                this.alerts.internalBearishCHoCH = isCHoCH
                this.alerts.internalBearishBOS = !isCHoCH
            } else {
                this.alerts.swingBearishCHoCH = isCHoCH
                this.alerts.swingBearishBOS = !isCHoCH
            }

            // Mark pivot as crossed and update trend
            lowPivot.crossed = true
            trend.bias = this.BEARISH

            // Store order block with volume information
            this.storeOrderBlock(lowPivot, internal, this.BEARISH)
        }
    }

    /**
     * Store order block information
     */
    private storeOrderBlock(pivot: Pivot, internal: boolean, bias: number): void {
        try {
            const orderBlocks = internal ? this.internalOrderBlocks : this.swingOrderBlocks

            // Find the index of the optimal order block
            const startIndex = pivot.barIndex
            const endIndex = this.highs.length - 1

            // Validate indices
            if (startIndex < 0 || endIndex < 0 || startIndex >= endIndex) {
                return
            }

            let parsedIndex: number = 0
            // For bullish order blocks, find the lowest low
            let minValue = Infinity
            // For bearish order blocks, find the highest high
            let maxValue = -Infinity

            if (bias === this.BEARISH) {
                for (let i = startIndex; i < endIndex; i++) {
                    if (this.parsedHighs[i] > maxValue) {
                        maxValue = this.parsedHighs[i]
                        parsedIndex = i
                    }
                }
            } else {
                for (let i = startIndex; i < endIndex; i++) {
                    if (this.parsedLows[i] < minValue) {
                        minValue = this.parsedLows[i]
                        parsedIndex = i
                    }
                }
            }

            logger.debug(`OB: internal=${internal} startIndex=${startIndex} parsedIndex=${parsedIndex} endIndex=${endIndex} min=${minValue} max=${maxValue}`)

            // Get volume information for this order block
            const volume = parsedIndex < this.volumes.length ? this.volumes[parsedIndex] : 0
            const volumeStrength = this.getVolumeStrength(parsedIndex)
            const highVolume = volume >= this.averageVolume * this.volumeThreshold

            // Phase 1: Get open and close for MT and COSD calculations
            const obOpen = this.parsedLows[parsedIndex]
            const obClose = this.parsedHighs[parsedIndex]

            // Create and store the order block with volume analysis + Phase 1 enhancements
            const orderBlock = new OrderBlock(
                this.parsedHighs[parsedIndex],
                this.parsedLows[parsedIndex],
                this.times[parsedIndex],
                bias,
                volume,
                highVolume,
                volumeStrength,
                obOpen,
                obClose,
            )

            // Phase 1: Classify Order Block Type (HP vs Continuation)
            if (this.classifyOrderBlocks) {
                orderBlock.type = this.classifyOrderBlockType(pivot, internal, bias)
                orderBlock.sweptLiquidity = this.wasLiquiditySwept()
            }

            // Phase 3C: ATR-based Order Block Size Filtering
            // if (this.enableOBSizeFilter && this.atr.isStable) {
            //     const atrValue = this.atr.getResult()
            //     if (atrValue && atrValue > 0) {
            //         const obSize = orderBlock.barHigh - orderBlock.barLow
            //         const minSize = atrValue * this.minOBSizeATRMultiplier
            //         const maxSize = atrValue * this.maxOBSizeATRMultiplier

            //         // Filter out OBs that are too small or too large
            //         if (obSize < minSize || obSize > maxSize) {
            //             return // Skip this OB - doesn't meet size criteria
            //         }
            //     }
            // }

            // Keep the array size limited
            if (orderBlocks.length >= this.MAX_ORDER_BLOCKS) {
                orderBlocks.pop()
            }

            // Add OB if it doesn't exist yet
            const exists = orderBlocks.find((ob: OrderBlock) => ob.equals(orderBlock))

            if (!exists) {
                orderBlocks.unshift(orderBlock)
            }
        } catch (error) {
            logger.error((error as Error).message, { error: (error as Error).stack })
        }
    }

    /**
     * Delete order blocks that have been mitigated (Phase 1: with mitigation tracking, Phase 2: Breaker detection)
     */
    private deleteOrderBlocks(internal: boolean): void {
        const orderBlocks = internal ? this.internalOrderBlocks : this.swingOrderBlocks

        const close = this.closes[this.closes.length - 1]

        // Check each order block
        for (let i = orderBlocks.length - 1; i >= 0; i--) {
            const block = orderBlocks[i]
            let crossedOrderBlock = false
            let becameBreaker = false

            // Check if the block has been mitigated

            if (
                block.bias === this.BEARISH &&
                this.bearishOrderBlockMitigationSource[
                    this.bearishOrderBlockMitigationSource.length - 1
                ] > block.barHigh &&
                block.mitigated === false
            ) {
                crossedOrderBlock = true

                block.mitigated = true
                block.mitigatedAt = this.times[this.times.length - 1]
                block.wasMitigated = true

                // Phase 1: Record mitigation
                block.recordMitigation(this.times[this.times.length - 1])

                if (internal) {
                    // Bearish OB broken UP → bullish signal
                    this.alerts.internalBearishObBrokenUp = true
                } else {
                    this.alerts.swingBearishObBrokenUp = true
                }
            } else if (
                block.bias === this.BULLISH &&
                this.bullishOrderBlockMitigationSource[
                    this.bullishOrderBlockMitigationSource.length - 1
                ] < block.barLow &&
                block.mitigated === false
            ) {
                crossedOrderBlock = true

                block.mitigated = true
                block.mitigatedAt = this.times[this.times.length - 1]
                block.wasMitigated = true

                // Phase 1: Record mitigation
                block.recordMitigation(this.times[this.times.length - 1])

                if (internal) {
                    // Bullish OB broken DOWN → bearish signal
                    this.alerts.internalBullishObBrokenDown = true
                } else {
                    this.alerts.swingBullishObBrokenDown = true
                }
            }

            if (
                !crossedOrderBlock &&
                !block.mitigated &&
                close < block.barHigh &&
                close > block.barLow
            ) {
                // Price is inside Order Block
                if (internal) {
                    if (block.bias === this.BULLISH) {
                        this.alerts.insideInternalBullishOrderBlock = true
                    } else {
                        this.alerts.insideInternalBearishOrderBlock = true
                    }
                } else {
                    if (block.bias === this.BULLISH) {
                        this.alerts.insideSwingBullishOrderBlock = true
                    } else {
                        this.alerts.insideSwingBearishOrderBlock = true
                    }
                }
            }

            // Phase 2: Check if HP Order Block failed and should become Breaker Block
            if (crossedOrderBlock && block.type === OrderBlockType.HIGH_PROBABILITY) {
                // HP OB was violated - check if it should become a Breaker

                // For HP Bullish OB (support): if price closes below, it failed → Bearish Breaker
                // For HP Bearish OB (resistance): if price closes above, it failed → Bullish Breaker
                if (block.bias === this.BULLISH && close < block.barLow) {
                    // HP Bullish OB failed - becomes Bearish Breaker (resistance)
                    block.type = OrderBlockType.BREAKER
                    block.bias = this.BEARISH // FLIP ROLE!
                    becameBreaker = true
                    this.alerts.breakerBlockFormed = true
                    // Don't delete - keep as Breaker
                } else if (block.bias === this.BEARISH && close > block.barHigh) {
                    // HP Bearish OB failed - becomes Bullish Breaker (support)
                    block.type = OrderBlockType.BREAKER
                    block.bias = this.BULLISH // FLIP ROLE!
                    becameBreaker = true
                    this.alerts.breakerBlockFormed = true
                    // Don't delete - keep as Breaker
                }
            }

            // Phase 3C: Check if Continuation OB failed and should become Mitigation Block
            if (crossedOrderBlock && block.type === OrderBlockType.CONTINUATION && !becameBreaker) {
                // Continuation OB was violated - mark as Mitigation (failed to support trend)
                block.type = OrderBlockType.MITIGATION
                // Don't delete - keep as Mitigation for context
            }

            // // Phase 3C: Check if Breaker/Mitigation failed and should become Reclaimed
            // if (
            //     crossedOrderBlock &&
            //     (block.type === OrderBlockType.BREAKER || block.type === OrderBlockType.MITIGATION)
            // ) {
            //     // If Breaker/Mitigation is violated again, it becomes Reclaimed (reverted)
            //     // For Bullish Breaker/Mitigation: if price closes below, it's reclaimed
            //     // For Bearish Breaker/Mitigation: if price closes above, it's reclaimed
            //     if (block.bias === this.BULLISH && close < block.barLow) {
            //         block.type = OrderBlockType.RECLAIMED
            //         block.mitigated = false // RESET: Allow OB to trigger alerts again when broken
            //         // Now very low priority - may delete on next iteration
            //     } else if (block.bias === this.BEARISH && close > block.barHigh) {
            //         block.type = OrderBlockType.RECLAIMED
            //         block.mitigated = false // RESET: Allow OB to trigger alerts again when broken
            //         // Now very low priority - may delete on next iteration
            //     }
            // }

            // Remove the block based on type and config
            // if (crossedOrderBlock && !becameBreaker) {
            //     // Phase 1: Remove the block if it has exceeded max mitigations
            //     // Only remove if it exceeds the configured max mitigations
            //     if (
            //         this.onlyTradeFreshOBs &&
            //         block.mitigationCount > this.maxOBMitigations &&
            //         block.wasMitigated
            //     ) {
            //         debug({
            //             block,
            //             reason: 'max mitigations exceeded',
            //         })

            //         // orderBlocks.splice(i, 1)
            //     } else if (!this.onlyTradeFreshOBs) {
            //         // Legacy behavior: always remove after mitigation
            //         // orderBlocks.splice(i, 1)
            //     }
            //     // Otherwise, keep it but mark as mitigated (can still use for context)
            // }
            // If becameBreaker = true, we keep it in the list with BREAKER type
        }
    }

    /**
     * Update trailing extremes
     */
    private updateTrailingExtremes(high: number, low: number, time: number): void {
        // Initialize top and bottom if they're zero
        if (this.trailing.top === 0) {
            this.trailing.top = high
            this.trailing.lastTopTime = time
        }
        if (this.trailing.bottom === 0) {
            this.trailing.bottom = low
            this.trailing.lastBottomTime = time
        }

        // Update if we have new extremes
        if (high > this.trailing.top) {
            this.trailing.top = high
            this.trailing.lastTopTime = time
        }
        if (low < this.trailing.bottom) {
            this.trailing.bottom = low
            this.trailing.lastBottomTime = time
        }

        // Update bar information
        this.trailing.barTime = time
        this.trailing.barIndex = this.currentBarIndex
    }

    /**
     * Delete fair value gaps that have been filled
     */
    private deleteFairValueGaps(high: number, low: number): void {
        for (let i = this.fairValueGaps.length - 1; i >= 0; i--) {
            const gap = this.fairValueGaps[i]

            // Check if the gap has been filled
            if (
                (gap.bias === this.BULLISH && low < gap.bottom) ||
                (gap.bias === this.BEARISH && high > gap.top)
            ) {
                // Remove the gap
                this.fairValueGaps.splice(i, 1)
            }
        }
    }

    /**
     * Detect fair value gaps
     */
    private detectFairValueGap(high: number, low: number, open: number, close: number): void {
        // Need at least 3 candles to detect a fair value gap
        if (this.highs.length < 3 || this.lows.length < 3) {
            return
        }

        // Create candles array from our stored high/low/close values
        const candles = this.highs.map((h, i) => ({
            high: this.highs[i],
            low: this.lows[i],
            close: this.closes[i],
            open: this.closes[i], // We don't store open values, so use close as approximation
            volume: this.volumes[i] || 0,
            time: this.times[i],
        }))

        // Use ta.ts findFairValueGaps function to detect gaps
        const fvgs = ta.findFairValueGaps(candles, this.volatilityMeasure * 0.5) || []

        // Process only the most recent FVG if one was found
        if (fvgs && fvgs.length > 0) {
            // Filter to only get new FVGs (those from the latest candle)
            const latestTime = this.times[this.times.length - 1]
            const newFvgs = fvgs.filter(fvg => fvg.time === latestTime)

            for (const fvg of newFvgs) {
                // Create our internal FVG representation
                const gap = new FairValueGap(
                    fvg.high,
                    fvg.low,
                    fvg.direction === 'bullish' ? this.BULLISH : this.BEARISH,
                )

                // Set appropriate alert
                if (fvg.direction === 'bullish') {
                    this.alerts.bullishFairValueGap = true
                } else {
                    this.alerts.bearishFairValueGap = true
                }

                // Add to our FVG array
                this.fairValueGaps.push(gap)

                // Limit FVG array size
                if (this.fairValueGaps.length > this.MAX_FAIR_VALUE_GAPS) {
                    this.fairValueGaps.shift()
                }
            }
        }
    }

    /**
     * Phase 2: Detect "The Unicorn" setup
     * The Unicorn = Breaker Block + Fair Value Gap alignment
     * One of the highest probability setups in ICT methodology
     */
    private detectUnicornSetup(): void {
        // Need both Breaker Blocks and Fair Value Gaps
        const swingBreakerBlocks = this.swingOrderBlocks.filter(
            ob => ob.type === OrderBlockType.BREAKER,
        )
        const internalBreakerBlocks = this.internalOrderBlocks.filter(
            ob => ob.type === OrderBlockType.BREAKER,
        )

        if (
            (swingBreakerBlocks.length === 0 && internalBreakerBlocks.length === 0) ||
            this.fairValueGaps.length === 0
        ) {
            return
        }

        // Check for alignment between Breaker Blocks and Fair Value Gaps
        const allBreakerBlocks = [...swingBreakerBlocks, ...internalBreakerBlocks]

        for (const breaker of allBreakerBlocks) {
            for (const fvg of this.fairValueGaps) {
                // Check if bias matches
                if (breaker.bias !== fvg.bias) {
                    continue
                }

                // Create unique key for this breaker+FVG pair
                const pairKey = `${breaker.barTime}-${fvg.top}-${fvg.bottom}-${breaker.bias}`

                // Skip if we've already detected this pair
                if (this.detectedUnicornPairs.has(pairKey)) {
                    continue
                }

                // Check if ranges overlap (Breaker Block intersects with FVG)
                const breakerTop = breaker.barHigh
                const breakerBottom = breaker.barLow
                const fvgTop = fvg.top
                const fvgBottom = fvg.bottom

                // Ranges overlap if: (start1 <= end2) and (start2 <= end1)
                const rangesOverlap = breakerBottom <= fvgTop && fvgBottom <= breakerTop

                if (rangesOverlap) {
                    // THE UNICORN DETECTED! 🦄
                    this.alerts.unicornSetup = true
                    this.detectedUnicornPairs.add(pairKey) // Mark as detected
                    return // Only need to detect once per candle
                }
            }
        }
    }

    /**
     * Update volume analysis including average volume and spike detection
     */
    private updateVolumeAnalysis(): void {
        try {
            if (this.volumes.length === 0) return

            // Calculate average volume over last 20 periods (or all available)
            const lookbackPeriods = Math.min(20, this.volumes.length)
            const recentVolumes = this.volumes.slice(-lookbackPeriods)

            // Ensure we don't divide by zero if all volumes are zero
            const sumVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0)
            this.averageVolume =
                recentVolumes.length > 0 ? sumVolume / recentVolumes.length : 0.00001

            // Set volume-based alerts
            this.alerts.volumeSpike = this.isVolumeSpike()
            this.alerts.institutionalVolume = this.isInstitutionalVolume()

            // Detect liquidity grabs
            this.detectLiquidityGrabs()
            this.updateLiquidityGrabsFollowThrough()

            // Session analysis is now called from main update method
        } catch (error) {
            logger.error((error as Error).message, { error: (error as Error).stack })
        }
    }

    /**
     * Check if current volume is a spike (above threshold)
     */
    private isVolumeSpike(): boolean {
        try {
            if (this.volumes.length === 0 || this.averageVolume === 0) return false

            const currentVolume = this.volumes[this.volumes.length - 1] || 0
            return currentVolume >= this.averageVolume * this.volumeThreshold
        } catch (error) {
            logger.error((error as Error).message, { error: (error as Error).stack })

            return false
        }
    }

    /**
     * Get volume-weighted strength for order blocks
     */
    private getVolumeStrength(barIndex: number): number {
        try {
            if (barIndex >= this.volumes.length || this.averageVolume === 0) return 1.0
            if (barIndex < 0) return 1.0

            const volume = this.volumes[barIndex] || 0
            return Math.min(volume / Math.max(this.averageVolume, 0.00001), 3.0) // Cap at 3x average
        } catch (error) {
            logger.error((error as Error).message, { error: (error as Error).stack })

            return 1.0
        }
    }

    /**
     * Check if current volume indicates institutional activity
     */
    private isInstitutionalVolume(): boolean {
        try {
            if (this.volumes.length === 0 || this.averageVolume === 0) return false

            const currentVolume = this.volumes[this.volumes.length - 1] || 0
            return currentVolume >= this.averageVolume * 2.0 // 2x average = institutional
        } catch (error) {
            logger.error((error as Error).message, { error: (error as Error).stack })

            return false
        }
    }

    /**
     * Detect liquidity grabs using volume and equal highs/lows
     */
    private detectLiquidityGrabs(): void {
        try {
            if (
                this.volumes.length < 3 ||
                this.highs.length < 1 ||
                this.lows.length < 1 ||
                this.times.length < 1
            )
                return

            const currentVolume = this.volumes[this.volumes.length - 1] || 0
            const currentHigh = this.highs[this.highs.length - 1]
            const currentLow = this.lows[this.lows.length - 1]
            const currentTime = this.times[this.times.length - 1]

            // Check for high liquidity grab
            if (this.equalHighDisplay.active && this.isVolumeSpike()) {
                const grab = new LiquidityGrab(
                    this.equalHighDisplay.level,
                    currentVolume,
                    currentTime,
                    'HighsGrab',
                    this.getVolumeStrengthCategory(currentVolume),
                    false, // Follow through determined later
                    this.currentBarIndex,
                )

                this.liquidityGrabs.push(grab)
                this.alerts.liquidityGrab = true

                // Trim array if too large
                if (this.liquidityGrabs.length > this.MAX_LIQUIDITY_GRABS) {
                    this.liquidityGrabs.shift()
                }
            }

            // Check for low liquidity grab
            if (this.equalLowDisplay.active && this.isVolumeSpike()) {
                const grab = new LiquidityGrab(
                    this.equalLowDisplay.level,
                    currentVolume,
                    currentTime,
                    'LowsGrab',
                    this.getVolumeStrengthCategory(currentVolume),
                    false,
                    this.currentBarIndex,
                )

                this.liquidityGrabs.push(grab)
                this.alerts.liquidityGrab = true

                if (this.liquidityGrabs.length > this.MAX_LIQUIDITY_GRABS) {
                    this.liquidityGrabs.shift()
                }
            }
        } catch (error) {
            logger.error((error as Error).message, { error: (error as Error).stack })
        }
    }

    /**
     * Categorize volume strength
     */
    private getVolumeStrengthCategory(volume: number): 'Weak' | 'Strong' | 'Extreme' {
        if (this.averageVolume === 0) return 'Weak'

        const ratio = volume / this.averageVolume
        if (ratio >= 3.0) return 'Extreme'
        if (ratio >= 2.0) return 'Strong'
        return 'Weak'
    }

    /**
     * Updates the followThrough property of recent liquidity grabs.
     */
    private updateLiquidityGrabsFollowThrough(): void {
        if (this.liquidityGrabs.length === 0 || this.highs.length < 2) {
            return
        }

        const lookbackWindow = 5 // How many bars after the grab to check for follow-through

        for (const grab of this.liquidityGrabs) {
            if (grab.followThrough) {
                continue // Already confirmed
            }

            const barsSinceGrab = this.currentBarIndex - grab.barIndex
            if (barsSinceGrab > 0 && barsSinceGrab <= lookbackWindow) {
                const close = this.highs[this.highs.length - 1] // Using high as a proxy for close for simplicity here
                const threshold = this.volatilityMeasure * 0.5

                if (grab.type === 'HighsGrab' && close < grab.level - threshold) {
                    grab.followThrough = true
                } else if (grab.type === 'LowsGrab' && close > grab.level + threshold) {
                    grab.followThrough = true
                }
            }
        }
    }

    /**
     * Update trading session analysis
     */
    private updateSessionAnalysis(time: number): void {
        const date = new Date(time)
        const hour = date.getUTCHours()

        // Determine current session based on UTC time
        this.currentSession = this.getTradingSession(hour)

        // Check for session-based volume patterns
        this.sessionHighVolume = this.isSessionHighVolume()
        this.sessionMajorMove = this.detectSessionMajorMove()

        // Set session alerts
        this.alerts.sessionBreakout = this.sessionMajorMove && this.sessionHighVolume
    }

    /**
     * Update Market Maker Analysis based on volume and price action
     */
    private updateMarketMakerAnalysis(
        high: number,
        low: number,
        close: number,
        volume: number,
        time: number,
        isUpdatingExistingCandle: boolean = false,
    ): void {
        // Update volume profile
        this.marketMakerAnalysis.volumeProfile.averageVolume = this.averageVolume

        if (!isUpdatingExistingCandle) {
            // Increment time in current phase
            this.marketMakerAnalysis.timeInPhase++
        }

        // Determine institutional activity level
        const volumeRatio = this.averageVolume > 0 ? volume / this.averageVolume : 1
        if (volumeRatio > 2.5) {
            this.marketMakerAnalysis.institutionalActivity = 'High'
        } else if (volumeRatio > 1.5) {
            this.marketMakerAnalysis.institutionalActivity = 'Medium'
        } else {
            this.marketMakerAnalysis.institutionalActivity = 'Low'
        }

        // Phase detection logic
        this.detectMarketPhase(high, low, close, volume)

        // Update confidence based on volume and structure alignment
        this.updatePhaseConfidence()

        // Determine expected direction
        this.updateExpectedDirection()
    }

    /**
     * Detect current market phase using volume and price action
     */
    private detectMarketPhase(high: number, low: number, close: number, volume: number): void {
        const currentPhase = this.marketMakerAnalysis.currentPhase
        const volumeRatio = this.averageVolume > 0 ? volume / this.averageVolume : 1
        const priceRange = high - low
        const avgRange = this.calculateAverageRange(10)

        // Phase detection with priority order

        // 1. Accumulation: High volume, low volatility, sideways movement (HIGHEST PRIORITY)
        // Use fallback for early candles when avgRange might be small
        const maxRangeThreshold = avgRange > 0 ? avgRange * 0.8 : priceRange * 1.5
        if (volumeRatio > 1.8 && (priceRange < maxRangeThreshold || avgRange === 0)) {
            if (currentPhase !== MarketPhase.ACCUMULATION) {
                this.marketMakerAnalysis.currentPhase = MarketPhase.ACCUMULATION
                this.marketMakerAnalysis.timeInPhase = 1
            }
        }
        // 2. Manipulation: Volume spikes with stop hunting (liquidity grabs)
        else if (this.alerts.liquidityGrab && volumeRatio > 2.0) {
            if (currentPhase !== MarketPhase.MANIPULATION) {
                this.marketMakerAnalysis.currentPhase = MarketPhase.MANIPULATION
                this.marketMakerAnalysis.timeInPhase = 1
            }
        }
        // 3. Distribution: High volume at tops, preparing for decline
        else if (volumeRatio > 2.5 && this.getCurrentZone(close) === Zone.PREMIUM) {
            if (currentPhase !== MarketPhase.DISTRIBUTION) {
                this.marketMakerAnalysis.currentPhase = MarketPhase.DISTRIBUTION
                this.marketMakerAnalysis.timeInPhase = 1
            }
        }
        // 4. Markup: Strong upward movement with decent volume (only if range is significant)
        else if (
            this.swingTrend.bias === this.BULLISH &&
            this.internalTrend.bias !== this.BEARISH &&
            volumeRatio > 1.2 &&
            priceRange >= avgRange * 0.8
        ) {
            if (currentPhase !== MarketPhase.MARKUP) {
                this.marketMakerAnalysis.currentPhase = MarketPhase.MARKUP
                this.marketMakerAnalysis.timeInPhase = 1
            }
        }
        // 5. Markdown: Strong downward movement with decent volume (only if range is significant)
        else if (
            this.swingTrend.bias === this.BEARISH &&
            this.internalTrend.bias !== this.BULLISH &&
            volumeRatio > 1.2 &&
            priceRange >= avgRange * 0.8
        ) {
            if (currentPhase !== MarketPhase.MARKDOWN) {
                this.marketMakerAnalysis.currentPhase = MarketPhase.MARKDOWN
                this.marketMakerAnalysis.timeInPhase = 1
            }
        }
    }

    /**
     * Update phase confidence based on various factors
     */
    private updatePhaseConfidence(): void {
        let confidence = 50 // Base confidence

        // Volume confirmation
        const volumeRatio =
            this.averageVolume > 0 ? this.volumes[this.volumes.length - 1] / this.averageVolume : 1

        if (volumeRatio > 2.0) confidence += 20
        else if (volumeRatio > 1.5) confidence += 10
        else if (volumeRatio < 0.8) confidence -= 15

        // Structure alignment
        if (this.swingTrend.bias !== this.NEUTRAL) confidence += 15
        if (this.internalTrend.bias === this.swingTrend.bias) confidence += 10

        // Time in phase (more time = more confidence, up to a point)
        const timeBonus = Math.min(this.marketMakerAnalysis.timeInPhase * 2, 20)
        confidence += timeBonus

        // Session timing
        if (
            this.currentSession === TradingSession.LONDON ||
            this.currentSession === TradingSession.NEW_YORK
        ) {
            confidence += 10
        }

        this.marketMakerAnalysis.phaseConfidence = Math.min(Math.max(confidence, 0), 100)
    }

    /**
     * Update expected direction based on current phase
     */
    private updateExpectedDirection(): void {
        const phase = this.marketMakerAnalysis.currentPhase

        switch (phase) {
            case MarketPhase.ACCUMULATION:
                this.marketMakerAnalysis.expectedDirection = 'Up'
                break
            case MarketPhase.DISTRIBUTION:
                this.marketMakerAnalysis.expectedDirection = 'Down'
                break
            case MarketPhase.MARKUP:
                this.marketMakerAnalysis.expectedDirection = 'Up'
                break
            case MarketPhase.MARKDOWN:
                this.marketMakerAnalysis.expectedDirection = 'Down'
                break
            case MarketPhase.MANIPULATION:
                // Direction depends on the underlying phase
                if (this.internalTrend.bias === this.BULLISH) {
                    this.marketMakerAnalysis.expectedDirection = 'Up'
                } else if (this.internalTrend.bias === this.BEARISH) {
                    this.marketMakerAnalysis.expectedDirection = 'Down'
                } else {
                    this.marketMakerAnalysis.expectedDirection = 'Sideways'
                }
                break
            default:
                this.marketMakerAnalysis.expectedDirection = 'Sideways'
        }
    }

    /**
     * Calculate average range over specified periods
     */
    private calculateAverageRange(periods: number): number {
        if (this.highs.length === 0) return 0

        let totalRange = 0
        const start = Math.max(0, this.highs.length - periods)
        const actualPeriods = this.highs.length - start

        for (let i = start; i < this.highs.length; i++) {
            totalRange += this.highs[i] - this.lows[i]
        }

        return actualPeriods > 0 ? totalRange / actualPeriods : 0
    }

    /**
     * Detect order flow patterns and institutional signatures
     */
    private detectOrderFlow(
        high: number,
        low: number,
        close: number,
        volume: number,
        time: number,
    ): void {
        const volumeRatio = this.averageVolume > 0 ? volume / this.averageVolume : 1
        const priceRange = high - low
        const avgRange = this.calculateAverageRange(10)

        // Absorption: High volume, low price movement
        if (volumeRatio > 2.0 && priceRange < avgRange * 0.6) {
            this.addOrderFlowSignal({
                type: OrderFlowType.ABSORPTION,
                strength: Math.min(volumeRatio * 25, 100),
                volume,
                price: close,
                time,
                institutionalSignature: true,
                followThroughProbability: 75,
                context:
                    'Large volume absorbed with minimal price movement - institutional accumulation likely',
            })
        }

        // Initiative: High volume with strong directional movement
        if (volumeRatio > 1.8 && priceRange > avgRange * 1.2) {
            this.addOrderFlowSignal({
                type: OrderFlowType.INITIATIVE,
                strength: Math.min((volumeRatio + priceRange / avgRange) * 20, 100),
                volume,
                price: close,
                time,
                institutionalSignature: volumeRatio > 2.5,
                followThroughProbability: volumeRatio > 2.5 ? 80 : 60,
                context: 'Strong directional movement with high volume - institutional initiative',
            })
        }

        // Exhaustion: Extremely high volume with diminishing price action
        if (volumeRatio > 3.0 && this.detectExhaustionPattern()) {
            this.addOrderFlowSignal({
                type: OrderFlowType.EXHAUSTION,
                strength: Math.min(volumeRatio * 20, 100),
                volume,
                price: close,
                time,
                institutionalSignature: true,
                followThroughProbability: 30,
                context: 'Volume exhaustion detected - potential reversal coming',
            })
        }

        // Responsive: Market responding to key levels with volume
        if (this.detectResponsiveFlow(close, volume)) {
            this.addOrderFlowSignal({
                type: OrderFlowType.RESPONSIVE,
                strength: Math.min(volumeRatio * 15, 100),
                volume,
                price: close,
                time,
                institutionalSignature: volumeRatio > 2.0,
                followThroughProbability: 65,
                context: 'Market responding to key level with volume confirmation',
            })
        }
    }

    /**
     * Add order flow signal to the array
     */
    private addOrderFlowSignal(signal: OrderFlowSignal): void {
        this.orderFlowSignals.push(signal)

        // Trim array if too large
        if (this.orderFlowSignals.length > this.MAX_ORDER_FLOW_SIGNALS) {
            this.orderFlowSignals.shift()
        }
    }

    /**
     * Detect exhaustion pattern in recent price action
     */
    private detectExhaustionPattern(): boolean {
        if (this.highs.length < 3) return false

        const recentHighs = this.highs.slice(-3)
        const recentLows = this.lows.slice(-3)
        const recentVolumes = this.volumes.slice(-3)

        // Look for diminishing returns despite increasing volume
        const rangeDecreasing = recentHighs[2] - recentLows[2] < recentHighs[0] - recentLows[0]
        const volumeIncreasing =
            recentVolumes[2] > recentVolumes[1] && recentVolumes[1] > recentVolumes[0]

        return rangeDecreasing && volumeIncreasing
    }

    /**
     * Detect responsive flow at key levels
     */
    private detectResponsiveFlow(price: number, volume: number): boolean {
        // Check if price is near order blocks
        const nearOrderBlock = this.isNearOrderBlock(price, 0.1) // 0.1% tolerance

        // Check if price is near fair value gaps
        const nearFVG = this.fairValueGaps.some(
            gap =>
                price >= Math.min(gap.top, gap.bottom) * 0.999 &&
                price <= Math.max(gap.top, gap.bottom) * 1.001,
        )

        // Volume must be above average
        const volumeSignificant = this.averageVolume > 0 && volume > this.averageVolume * 1.3

        return (nearOrderBlock || nearFVG) && volumeSignificant
    }

    /**
     * Check if price is near any order block
     */
    private isNearOrderBlock(price: number, tolerancePercent: number): boolean {
        const allOrderBlocks = [...this.swingOrderBlocks, ...this.internalOrderBlocks]

        return allOrderBlocks.some(block => {
            const blockMid = (block.barHigh + block.barLow) / 2
            const tolerance = (blockMid * tolerancePercent) / 100
            return Math.abs(price - blockMid) <= tolerance
        })
    }

    public buildCandles(): Candle[] {
        return buildCandles(
            this.highs,
            this.lows,
            this.opens,
            this.closes,
            this.volumes,
            this.times,
        )
    }

    /**
     * Get Market Maker Analysis
     */
    public getMarketMakerAnalysis(): MarketMakerAnalysis {
        return this.marketMakerAnalysis
    }

    /**
     * Get recent order flow signals
     */
    public getOrderFlowSignals(limit: number = 10): OrderFlowSignal[] {
        return this.orderFlowSignals.slice(-limit)
    }

    /**
     * Get recent liquidity grabs
     */
    public getLiquidityGrabs(limit: number = 10): LiquidityGrab[] {
        return this.liquidityGrabs.slice(-limit)
    }

    /**
     * Get trading session based on UTC hour
     */
    private getTradingSession(utcHour: number): TradingSession {
        if (utcHour >= 0 && utcHour < 7) {
            return TradingSession.ASIAN
        } else if (utcHour >= 7 && utcHour < 12) {
            return TradingSession.LONDON
        } else if (utcHour >= 12 && utcHour < 17) {
            return TradingSession.LONDON_NY_OVERLAP
        } else if (utcHour >= 17 && utcHour < 22) {
            return TradingSession.NEW_YORK
        } else {
            return TradingSession.ASIAN
        }
    }

    /**
     * Check if volume is high for current session
     */
    private isSessionHighVolume(): boolean {
        if (this.volumes.length === 0 || this.averageVolume === 0) return false

        const currentVolume = this.volumes[this.volumes.length - 1]

        // Session-specific volume multipliers
        const sessionMultipliers = {
            [TradingSession.ASIAN]: 0.7, // Lower volume session
            [TradingSession.LONDON]: 1.3, // High volume session
            [TradingSession.LONDON_NY_OVERLAP]: 1.5, // Highest volume
            [TradingSession.NEW_YORK]: 1.2, // High volume session
            [TradingSession.UNKNOWN]: 1.0,
        }

        const sessionThreshold = this.averageVolume * sessionMultipliers[this.currentSession]
        return currentVolume > sessionThreshold
    }

    /**
     * Detect major moves during trading sessions
     */
    private detectSessionMajorMove(): boolean {
        if (this.highs.length < 5) return false

        const recentBars = 5
        const recentHighs = this.highs.slice(-recentBars)
        const recentLows = this.lows.slice(-recentBars)

        const sessionRange = Math.max(...recentHighs) - Math.min(...recentLows)
        const averageRange = this.volatilityMeasure || 0.001

        // Major move if range is 2x normal volatility
        return sessionRange > averageRange * 2.0
    }

    /**
     * Calculate confluence score for current market conditions
     * Phase 3B: Enhanced with OB hierarchy scoring
     * Phase 4: Added Market Maker alignment scoring
     */
    private calculateConfluenceScore(): number {
        // Scoring System:
        // Base Score (100 max): Structure (40) + Zone (25) + Session (10) + Liquidity (10) + Market Maker (15)
        // Bonus Score (25 max): Volume
        // Total Max: 125 points
        // Threshold should be ~40-50 (achievable without volume)

        let baseScore = 0
        let bonusScore = 0

        // 1. Structure Alignment (40 points max) - BASE (includes OB hierarchy)
        const structureScore = this.getStructureAlignmentScore()
        this.confluenceComponents.structureAlignment = structureScore
        baseScore += structureScore

        // 2. Zone Alignment (25 points max) - BASE (increased from 20)
        const zoneScore = this.getZoneAlignmentScore()
        this.confluenceComponents.zoneAlignment = zoneScore
        baseScore += zoneScore

        // 3. Session Timing (10 points max) - BASE (decreased from 15)
        const sessionScore = this.getSessionTimingScore()
        this.confluenceComponents.sessionTiming = sessionScore
        baseScore += sessionScore

        // 4. Liquidity Context (10 points max) - BASE
        const liquidityScore = this.getLiquidityContextScore()
        this.confluenceComponents.liquidityContext = liquidityScore
        baseScore += liquidityScore

        // 5. Market Maker Alignment (15 points max) - BASE
        const marketMakerScore = this.getMarketMakerAlignmentScore()
        this.confluenceComponents.marketMakerAlignment = marketMakerScore
        baseScore += marketMakerScore

        // 6. Volume Confirmation (25 points max) - BONUS
        const volumeScore = this.getVolumeConfirmationScore()
        this.confluenceComponents.volumeConfirmation = volumeScore
        bonusScore += volumeScore

        const totalScore = baseScore + bonusScore
        this.lastConfluenceScore = totalScore
        return totalScore
    }

    /**
     * Get structure alignment score (swing + internal agreement)
     * Phase 3B: Enhanced with Order Block hierarchy weighting
     */
    private getStructureAlignmentScore(): number {
        let score = 0

        // Perfect alignment: swing and internal bias agree
        if (
            this.swingTrend.bias === this.internalTrend.bias &&
            this.swingTrend.bias !== this.NEUTRAL
        ) {
            score += 15 // Reduced from 20 to make room for OB priority
        } else if (
            this.swingTrend.bias !== this.NEUTRAL ||
            this.internalTrend.bias !== this.NEUTRAL
        ) {
            score += 8 // Partial alignment (reduced from 10)
        }

        // Recent structure breaks add confidence
        if (this.alerts.swingBullishBOS || this.alerts.swingBearishBOS) {
            score += 7 // Strong structure break (reduced from 10)
        } else if (this.alerts.internalBullishBOS || this.alerts.internalBearishBOS) {
            score += 4 // Internal structure break (reduced from 5)
        }

        // Phase 3B: Order Block Type Hierarchy Bonus (max 10 points)
        // Prioritize higher quality OBs: Breaker > HP > Continuation > Mitigation > Reclaimed
        const obBonus = this.getOrderBlockHierarchyBonus()
        score += obBonus

        return Math.min(score, 40) // Increased from 30 to accommodate OB hierarchy
    }

    /**
     * Phase 3B: Get bonus points based on Order Block hierarchy
     * Breaker Blocks and HP OBs get priority in confluence scoring
     */
    private getOrderBlockHierarchyBonus(): number {
        let bonus = 0

        // Check swing OBs for highest priority active blocks
        const activeSwingOBs = this.swingOrderBlocks.filter(ob => !ob.mitigated)
        if (activeSwingOBs.length > 0) {
            const maxPriority = Math.max(...activeSwingOBs.map(ob => ob.getPriority()))
            if (maxPriority === 10) {
                // Breaker Block present
                bonus += 10
                if (this.alerts.unicornSetup) {
                    bonus += 5 // Extra bonus for Unicorn setup
                }
            } else if (maxPriority === 8) {
                // HP OB present
                bonus += 7
            } else if (maxPriority === 5) {
                // Continuation OB
                bonus += 4
            } else if (maxPriority === 3) {
                // Mitigation Block
                bonus += 2
            }
            // Reclaimed OBs (priority 1) get no bonus
        }

        return Math.min(bonus, 15) // Cap at 15 points
    }

    /**
     * Get volume confirmation score
     */
    private getVolumeConfirmationScore(): number {
        if (this.volumes.length === 0 || this.averageVolume === 0) return 0

        let score = 0
        const currentVolume = this.volumes[this.volumes.length - 1]
        const volumeRatio = currentVolume / this.averageVolume

        // Volume strength scoring
        if (volumeRatio >= 3.0) {
            score += 25 // Extreme volume
        } else if (volumeRatio >= 2.0) {
            score += 20 // High institutional volume
        } else if (volumeRatio >= 1.5) {
            score += 15 // Above average volume
        } else if (volumeRatio >= 1.2) {
            score += 10 // Moderate volume
        } else if (volumeRatio >= 0.8) {
            score += 5 // Normal volume
        } else {
            score += 1 // Always give minimum score if volume data exists
        }

        return Math.min(score, 25)
    }

    /**
     * Get zone alignment score (premium/discount context)
     * NEW: Increased from 20 max to 25 max (compensate for volume becoming bonus)
     */
    private getZoneAlignmentScore(): number {
        const currentPrice = this.highs[this.highs.length - 1] // Use current high as proxy
        const zoneInfo = this.getCurrentZone(currentPrice)

        let score = 0

        // Zone-based scoring (increased weights)
        if (zoneInfo === 'Premium') {
            // Premium zone - good for sells
            if (this.swingTrend.bias === this.BEARISH || this.internalTrend.bias === this.BEARISH) {
                score += 18 // Increased from 15
            } else {
                score += 6 // Less ideal for buys (increased from 5)
            }
        } else if (zoneInfo === 'Discount') {
            // Discount zone - good for buys
            if (this.swingTrend.bias === this.BULLISH || this.internalTrend.bias === this.BULLISH) {
                score += 18 // Increased from 15
            } else {
                score += 6 // Less ideal for sells (increased from 5)
            }
        } else {
            score += 10 // Equilibrium - neutral (increased from 8)
        }

        // Additional points for extreme zones
        const trailing = this.getCurrentZoneTraillings()
        const range = trailing.top - trailing.bottom
        const pricePosition = (currentPrice - trailing.bottom) / range

        if (pricePosition > 0.9 || pricePosition < 0.1) {
            score += 7 // Extreme zone position (increased from 5)
        }

        return Math.min(score, 25)
    }

    /**
     * Get session timing score
     * NEW: Decreased from 15 max to 10 max (less weight on timing)
     */
    private getSessionTimingScore(): number {
        let score = 0

        // Session-based scoring (reduced weights)
        switch (this.currentSession) {
            case TradingSession.LONDON:
                score += 8 // High activity session (reduced from 12)
                break
            case TradingSession.LONDON_NY_OVERLAP:
                score += 10 // Highest activity session (reduced from 15)
                break
            case TradingSession.NEW_YORK:
                score += 7 // High activity session (reduced from 10)
                break
            case TradingSession.ASIAN:
                score += 4 // Lower activity session (reduced from 5)
                break
            default:
                score += 2
        }

        return Math.min(score, 10)
    }

    /**
     * Get liquidity context score
     */
    private getLiquidityContextScore(): number {
        let score = 0

        // Recent liquidity grabs add context
        if (this.alerts.liquidityGrab) {
            score += 8 // Recent liquidity taken
        }

        // Equal highs/lows provide liquidity targets
        if (
            this.equalHighDisplay.active ||
            this.equalLowDisplay.active ||
            this.alerts.equalHighs ||
            this.alerts.equalLows
        ) {
            score += 2 // Liquidity levels present
        }

        return Math.min(score, 10)
    }

    /**
     * Get market maker alignment score based on phase, confidence, and expected direction
     * Uses currentPhase, phaseConfidence, and expectedDirection from marketMakerAnalysis
     * Total max: 15 points (phase alignment: 8 + confidence: 4 + direction: 3)
     */
    private getMarketMakerAlignmentScore(): number {
        let score = 0
        const { currentPhase, phaseConfidence, expectedDirection } = this.marketMakerAnalysis

        // 1. Phase alignment with trend (max 8 points: 5 for swing + 3 for internal)
        // Accumulation/Markup phases are bullish, Distribution/Markdown are bearish
        const phaseBias = this.getPhaseDirectionBias(currentPhase)

        if (phaseBias !== 'Sideways') {
            // Check if phase aligns with current swing trend
            if (
                (phaseBias === 'Up' && this.swingTrend.bias === this.BULLISH) ||
                (phaseBias === 'Down' && this.swingTrend.bias === this.BEARISH)
            ) {
                score += 5 // Phase aligns with swing trend
            }

            // Check if phase aligns with internal trend
            if (
                (phaseBias === 'Up' && this.internalTrend.bias === this.BULLISH) ||
                (phaseBias === 'Down' && this.internalTrend.bias === this.BEARISH)
            ) {
                score += 3 // Phase aligns with internal trend
            }
        }

        // 2. Phase confidence bonus (max 4 points)
        // Higher confidence = more reliable phase detection
        if (phaseConfidence >= 80) {
            score += 4 // Very high confidence
        } else if (phaseConfidence >= 70) {
            score += 3 // High confidence
        } else if (phaseConfidence >= 60) {
            score += 2 // Moderate confidence
        } else if (phaseConfidence >= 50) {
            score += 1 // Low confidence
        }

        // 3. Expected direction alignment with trend (max 3 points)
        if (expectedDirection !== 'Sideways') {
            const directionMatchesSwing =
                (expectedDirection === 'Up' && this.swingTrend.bias === this.BULLISH) ||
                (expectedDirection === 'Down' && this.swingTrend.bias === this.BEARISH)

            if (directionMatchesSwing) {
                score += 3 // Expected direction matches swing trend
            }
        }

        return Math.min(score, 15)
    }

    /**
     * Get the inherent directional bias of a market phase
     */
    private getPhaseDirectionBias(phase: MarketPhase): 'Up' | 'Down' | 'Sideways' {
        switch (phase) {
            case MarketPhase.ACCUMULATION:
                return 'Up' // Accumulation typically leads to markup
            case MarketPhase.MARKUP:
                return 'Up' // Actively moving up
            case MarketPhase.DISTRIBUTION:
                return 'Down' // Distribution typically leads to markdown
            case MarketPhase.MARKDOWN:
                return 'Down' // Actively moving down
            case MarketPhase.MANIPULATION:
                return 'Sideways' // Could go either way
            case MarketPhase.REACCUMULATION:
                return 'Up' // Secondary accumulation before continuation
            default:
                return 'Sideways'
        }
    }

    /**
     * Get confluence recommendation based on score
     */
    private getConfluenceRecommendation(score: number): 'Strong' | 'Moderate' | 'Weak' | 'Avoid' {
        if (score >= 80) return 'Strong'
        if (score >= 60) return 'Moderate'
        if (score >= 40) return 'Weak'
        return 'Avoid'
    }

    /**
     * Get confluence strength category
     */
    private getConfluenceStrength(score: number): 'Excellent' | 'Good' | 'Fair' | 'Poor' {
        if (score >= 85) return 'Excellent'
        if (score >= 70) return 'Good'
        if (score >= 50) return 'Fair'
        return 'Poor'
    }

    /**
     * Check if current volume confirms a structure break (but not required for breaks)
     * This is used separately as a supplemental indicator, not a requirement
     */
    private hasConfirmingVolume(internal: boolean): boolean {
        try {
            // If no volume data or not tracking enough volume data yet
            if (this.volumes.length === 0 || this.averageVolume === 0) {
                return false // No volume confirmation possible without data
            }

            const currentVolume = this.volumes[this.volumes.length - 1] || 0

            // For swing structure - higher volume threshold
            if (!internal) {
                return currentVolume > this.averageVolume * 0.8
            }

            // For internal structure - lower volume threshold
            return currentVolume > this.averageVolume * 0.5
        } catch (error) {
            logger.error((error as Error).message, { error: (error as Error).stack })

            return false
        }
    }

    /**
     * Trim history arrays to prevent memory issues
     */
    private trimHistoryArrays(): void {
        if (this.highs.length > this.MAX_HISTORY_LENGTH) {
            const excess = this.highs.length - this.MAX_HISTORY_LENGTH
            this.highs.splice(0, excess)
            this.lows.splice(0, excess)
            this.closes.splice(0, excess)
            this.times.splice(0, excess)
            this.volumes.splice(0, excess)
            this.parsedHighs.splice(0, excess)
            this.parsedLows.splice(0, excess)
            this.bearishOrderBlockMitigationSource.splice(0, excess)
            this.bullishOrderBlockMitigationSource.splice(0, excess)

            // Adjust current bar index to maintain relative positioning
            this.currentBarIndex = Math.max(0, this.currentBarIndex - excess)
            this.lastBarIndex = Math.max(0, this.lastBarIndex - excess)
        }
    }

    /**
     * Get current alerts
     */
    public getAlerts(): Alerts {
        return this.alerts
    }

    /**
     * Get current trend bias
     */
    public getTrendBias(): TrendBias {
        return this.swingTrend.bias === this.BULLISH
            ? TrendBias.BULLISH
            : this.swingTrend.bias === this.BEARISH
              ? TrendBias.BEARISH
              : TrendBias.NEUTRAL
    }

    /**
     * Get current internal structure bias
     */
    public getInternalBias(): TrendBias {
        return this.internalTrend.bias === this.BULLISH
            ? TrendBias.BULLISH
            : this.internalTrend.bias === this.BEARISH
              ? TrendBias.BEARISH
              : TrendBias.NEUTRAL
    }

    /**
     * Get premium/discount zone status
     */
    public getCurrentZone(price?: number): Zone {
        price = price ?? this.closes[this.closes.length - 1]

        // Validate price input
        if (!Number.isFinite(price)) {
            logger.debug(`Invalid price for zone calculation: ${price}`)

            return Zone.EQUILIBRIUM
        }

        if (
            !this.trailing.top ||
            !this.trailing.bottom ||
            this.trailing.top === 0 ||
            this.trailing.bottom === 0 ||
            this.trailing.top === this.trailing.bottom
        ) {
            return Zone.EQUILIBRIUM
        }

        // Range from highest high to lowest low
        const range = this.trailing.top - this.trailing.bottom

        if (range <= 0) {
            return Zone.EQUILIBRIUM
        }

        const premiumThreshold = this.trailing.bottom + range * 0.95
        const discountThreshold = this.trailing.bottom + range * 0.05

        if (price >= premiumThreshold) {
            return Zone.PREMIUM
        } else if (price <= discountThreshold) {
            return Zone.DISCOUNT
        } else {
            return Zone.EQUILIBRIUM
        }
    }

    /**
     * Get current zone trailing information
     */
    public getCurrentZoneTraillings() {
        const range = this.trailing.top - this.trailing.bottom
        const premiumThreshold = this.trailing.bottom + range * 0.95
        const discountThreshold = this.trailing.bottom + range * 0.05

        return {
            ...this.trailing,
            premiumThreshold,
            discountThreshold,
        }
    }

    /**
     * Debug method to get comprehensive Smart Money Concepts data
     * // TODO call it getContext, and replace current `MarketContext`, all data is in here
     */
    public getDebugInfo(currentPrice?: number) {
        currentPrice = currentPrice || this.closes[this.closes.length - 1]

        // Always recalculate confluence score before returning debug info
        this.calculateConfluenceScore()

        // Format order blocks with start/end information
        const formatOrderBlocks = (blocks: OrderBlock[], type: string) => {
            return blocks.map((block, index) => ({
                index,
                type: block.type, // Phase 3: Include actual OrderBlockType (hp, continuation, breaker, etc.)
                displayType: type, // Original display type (Swing Bullish, etc.)
                bias: block.bias === this.BULLISH ? 'Bullish' : 'Bearish',
                high: block.barHigh,
                low: block.barLow,
                time: block.barTime,
                range: block.barHigh - block.barLow,
                midpoint: (block.barHigh + block.barLow) / 2,
                active: true,
                mitigated: block.mitigated,
                mitigationCount: block.mitigationCount || 0,
            }))
        }

        // Get current zone information
        const currentZone = this.getCurrentZone(currentPrice)
        const zoneTraillings = this.getCurrentZoneTraillings()

        // Get Fair Value Gaps information
        const fairValueGapsInfo = this.fairValueGaps.map((gap, index) => ({
            index,
            type: 'Fair Value Gap',
            bias: gap.bias === this.BULLISH ? 'Bullish' : 'Bearish',
            top: gap.top,
            bottom: gap.bottom,
            range: gap.top - gap.bottom,
            midpoint: (gap.top + gap.bottom) / 2,
        }))

        // Get Equal Highs/Lows information
        const equalHighsLowsInfo = {
            equalHighs: this.equalHigh
                ? {
                      level: this.equalHigh.currentLevel,
                      lastLevel: this.equalHigh.lastLevel,
                      crossed: this.equalHigh.crossed,
                      barTime: this.equalHigh.barTime,
                      barIndex: this.equalHigh.barIndex,
                  }
                : null,
            equalLows: this.equalLow
                ? {
                      level: this.equalLow.currentLevel,
                      lastLevel: this.equalLow.lastLevel,
                      crossed: this.equalLow.crossed,
                      barTime: this.equalLow.barTime,
                      barIndex: this.equalLow.barIndex,
                  }
                : null,
        }

        // Get volatility information
        const volatilityInfo = {
            volatilityMeasure: this.volatilityMeasure,
            highVolatilityBar: this.highVolatilityBar,
        }

        return {
            // Market Structure & Biases
            biases: {
                swingTrendBias: this.getTrendBias(),
                internalTrendBias: this.getInternalBias(),
            },

            // Premium/Discount Zones
            currentZone: {
                zone: currentZone,
                price: currentPrice,
                trailing: {
                    top: zoneTraillings.top,
                    bottom: zoneTraillings.bottom,
                    range: zoneTraillings.top - zoneTraillings.bottom,
                    premiumThreshold: zoneTraillings.premiumThreshold,
                    discountThreshold: zoneTraillings.discountThreshold,
                    lastTopTime: zoneTraillings.lastTopTime,
                    lastBottomTime: zoneTraillings.lastBottomTime,
                },
            },

            // Order Blocks
            orderBlocks: {
                swing: {
                    bullish: formatOrderBlocks(
                        this.swingOrderBlocks.filter(block => block.bias === this.BULLISH),
                        'Swing Bullish',
                    ),
                    bearish: formatOrderBlocks(
                        this.swingOrderBlocks.filter(block => block.bias === this.BEARISH),
                        'Swing Bearish',
                    ),
                    total: this.swingOrderBlocks.length,
                    highVolume: this.swingOrderBlocks.filter(block => block.highVolume).length,
                },
                internal: {
                    bullish: formatOrderBlocks(
                        this.internalOrderBlocks.filter(block => block.bias === this.BULLISH),
                        'Internal Bullish',
                    ),
                    bearish: formatOrderBlocks(
                        this.internalOrderBlocks.filter(block => block.bias === this.BEARISH),
                        'Internal Bearish',
                    ),
                    total: this.internalOrderBlocks.length,
                    highVolume: this.internalOrderBlocks.filter(block => block.highVolume).length,
                },
            },

            // Fair Value Gaps
            fairValueGaps: {
                gaps: fairValueGapsInfo,
                bullish: fairValueGapsInfo.filter(gap => gap.bias === 'Bullish'),
                bearish: fairValueGapsInfo.filter(gap => gap.bias === 'Bearish'),
                total: this.fairValueGaps.length,
            },

            // Equal Highs and Lows
            equalHighsLows: equalHighsLowsInfo,

            // Market Volatility
            volatility: volatilityInfo,

            volume: {
                current: this.volumes[this.volumes.length - 1] || 0,
                average: this.averageVolume,
                isSpike: this.volumes.length > 0 ? this.isVolumeSpike() : false,
                spikeThreshold: this.volumeThreshold,
                history: this.volumes.slice(-10), // Last 10 volumes
            },

            liquidityGrabs: {
                recent: this.liquidityGrabs.slice(-5).map(grab => ({
                    level: grab.level,
                    type: grab.type,
                    strength: grab.strength,
                    volume: grab.volume,
                    time: grab.time,
                    followThrough: grab.followThrough,
                })),
                total: this.liquidityGrabs.length,
                highsGrabs: this.liquidityGrabs.filter(g => g.type === 'HighsGrab').length,
                lowsGrabs: this.liquidityGrabs.filter(g => g.type === 'LowsGrab').length,
            },

            session: {
                current: this.currentSession,
                highVolume: this.sessionHighVolume,
                majorMove: this.sessionMajorMove,
                institutionalActivity:
                    this.sessionHighVolume && this.sessionMajorMove
                        ? 'High'
                        : this.sessionHighVolume || this.sessionMajorMove
                          ? 'Medium'
                          : 'Low',
            },

            confluence: {
                score: this.lastConfluenceScore,
                components: this.confluenceComponents,
                recommendation: this.getConfluenceRecommendation(this.lastConfluenceScore),
                strength: this.getConfluenceStrength(this.lastConfluenceScore),
            },

            // Market Maker Analysis
            marketMaker: {
                analysis: this.getMarketMakerAnalysis(),
                orderFlow: this.getOrderFlowSignals(5),
            },

            // Current Alerts
            alerts: {
                ...this.alerts,
            },

            // Current Bar Information
            barInfo: {
                currentBarIndex: this.currentBarIndex,
                lastBarIndex: this.lastBarIndex,
                initialTime: this.initialTime,
            },

            // Candle Pattern Analysis (for exhaustion detection)
            candlePatterns: this.getConsecutiveCandles(),

            // Exhaustion Analysis (comprehensive multi-factor exhaustion detection)
            exhaustion: this.calculateExhaustion(currentPrice),

            // Summary Statistics
            summary: {
                totalSwingOrderBlocks: this.swingOrderBlocks.length,
                totalInternalOrderBlocks: this.internalOrderBlocks.length,
                totalFairValueGaps: this.fairValueGaps.length,
                swingBullishBlocks: this.swingOrderBlocks.filter(
                    block => block.bias === this.BULLISH,
                ).length,
                swingBearishBlocks: this.swingOrderBlocks.filter(
                    block => block.bias === this.BEARISH,
                ).length,
                internalBullishBlocks: this.internalOrderBlocks.filter(
                    block => block.bias === this.BULLISH,
                ).length,
                internalBearishBlocks: this.internalOrderBlocks.filter(
                    block => block.bias === this.BEARISH,
                ).length,
                bullishFVGs: this.fairValueGaps.filter(gap => gap.bias === this.BULLISH).length,
                bearishFVGs: this.fairValueGaps.filter(gap => gap.bias === this.BEARISH).length,
            },
        }
    }

    /**
     * Calculate consecutive bullish/bearish candles from the end of history.
     * A bullish candle has close > open, bearish has close < open.
     * Returns count (positive for bullish streak, negative for bearish streak)
     * and the direction of the streak.
     */
    public getConsecutiveCandles(): {
        consecutiveBullish: number
        consecutiveBearish: number
        lastCandleDirection: 'bullish' | 'bearish' | 'doji'
    } {
        if (this.opens.length === 0 || this.closes.length === 0) {
            return {
                consecutiveBullish: 0,
                consecutiveBearish: 0,
                lastCandleDirection: 'doji',
            }
        }

        let consecutiveBullish = 0
        let consecutiveBearish = 0

        // Start from the most recent closed candle and count backwards
        for (let i = this.opens.length - 2; i >= 0; i--) {
            const open = this.opens[i]
            const close = this.closes[i]

            const isBullish = close > open
            const isBearish = close < open

            if (isBullish) {
                if (consecutiveBearish > 0) {
                    // Streak broken - we were counting bearish
                    break
                }
                consecutiveBullish++
            } else if (isBearish) {
                if (consecutiveBullish > 0) {
                    // Streak broken - we were counting bullish
                    break
                }
                consecutiveBearish++
            } else {
                // Doji candle - always breaks any existing streak
                // If no streak started yet, just skip this candle
                if (consecutiveBullish > 0 || consecutiveBearish > 0) {
                    break
                }
                // Continue looking back for first non-doji candle
            }
        }

        // Determine last candle direction
        const lastOpen = this.opens[this.opens.length - 1]
        const lastClose = this.closes[this.closes.length - 1]
        const lastCandleDirection: 'bullish' | 'bearish' | 'doji' =
            lastClose > lastOpen ? 'bullish' : lastClose < lastOpen ? 'bearish' : 'doji'

        return {
            consecutiveBullish,
            consecutiveBearish,
            lastCandleDirection,
        }
    }

    /**
     * Get recent candle data for analysis
     */
    private getRecentCandleData(count: number): Array<{
        open: number
        high: number
        low: number
        close: number
        volume: number
    }> {
        const candles: Array<{
            open: number
            high: number
            low: number
            close: number
            volume: number
        }> = []
        const startIndex = Math.max(0, this.closes.length - count)

        for (let i = startIndex; i < this.closes.length; i++) {
            candles.push({
                open: this.opens[i],
                high: this.highs[i],
                low: this.lows[i],
                close: this.closes[i],
                volume: this.volumes[i] || 0,
            })
        }

        return candles
    }

    /**
     * Calculate volume trend over recent candles
     * Returns negative value if declining, positive if increasing
     */
    private calculateVolumeTrend(volumes: number[]): number {
        if (volumes.length < 2) return 0

        // Calculate linear regression slope
        const n = volumes.length
        let sumX = 0
        let sumY = 0
        let sumXY = 0
        let sumXX = 0

        for (let i = 0; i < n; i++) {
            sumX += i
            sumY += volumes[i]
            sumXY += i * volumes[i]
            sumXX += i * i
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
        const avgVolume = sumY / n

        // Return slope as percentage of average volume
        return (slope / (avgVolume || 1)) * 100
    }

    /**
     * Check if price is consolidating (range tightening)
     */
    private isConsolidating(): boolean {
        if (this.highs.length < 20) return false

        const recentRange = this.calculateRangeTightness()
        return recentRange < 0.5 // Range less than 50% of historical average
    }

    /**
     * Calculate how tight the current range is compared to historical average
     * Returns value < 1 if range is tightening, > 1 if expanding
     */
    private calculateRangeTightness(): number {
        if (this.highs.length < 20) return 1

        // Recent 10 candles range
        const recentStart = this.highs.length - 10
        const recentHigh = Math.max(...this.highs.slice(recentStart))
        const recentLow = Math.min(...this.lows.slice(recentStart))
        const recentRange = recentHigh - recentLow

        // Historical 20 candles range
        const historicalStart = this.highs.length - 20
        const historicalHigh = Math.max(...this.highs.slice(historicalStart))
        const historicalLow = Math.min(...this.lows.slice(historicalStart))
        const historicalRange = historicalHigh - historicalLow

        return recentRange / (historicalRange || 1)
    }

    /**
     * Calculate comprehensive exhaustion analysis
     */
    private calculateExhaustion(currentPrice: number): {
        consecutiveAgainst: {
            bullish: number
            bearish: number
            avgCandleSize: number
            direction: 'bullish' | 'bearish' | 'neutral'
        }
        volumeExhaustion: {
            isDeclining: boolean
            declineRate: number
            comparedToAverage: number
        }
        priceAction: {
            wickRatio: number
            consolidating: boolean
            rangeTightness: number
        }
        structureSignals: {
            biasFlipped: boolean
            weakStructure: boolean
            divergence: boolean
        }
        exhaustionScore: number
        exhaustionLevel: 'none' | 'low' | 'medium' | 'high' | 'extreme'
    } {
        // 1. Consecutive candles analysis
        const candlePatterns = this.getConsecutiveCandles()
        const recentCandles = this.getRecentCandleData(10)
        const avgCandleSize =
            recentCandles.length > 0
                ? recentCandles.reduce(
                      (sum, c) => sum + (Math.abs(c.close - c.open) / c.open) * 100,
                      0,
                  ) / recentCandles.length
                : 0

        // 2. Volume exhaustion
        const recentVolumes = this.volumes.slice(-5)
        const volumeTrend = this.calculateVolumeTrend(recentVolumes)
        const volumeVsAvg =
            this.volumes.length > 0
                ? (this.volumes[this.volumes.length - 1] || 0) / (this.averageVolume || 1)
                : 1

        // 3. Price action (wick analysis)
        const lastCandle =
            this.closes.length > 0
                ? {
                      open: this.opens[this.opens.length - 1],
                      close: this.closes[this.closes.length - 1],
                      high: this.highs[this.highs.length - 1],
                      low: this.lows[this.lows.length - 1],
                  }
                : { open: currentPrice, close: currentPrice, high: currentPrice, low: currentPrice }

        const body = Math.abs(lastCandle.close - lastCandle.open)
        const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close)
        const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low
        const wickRatio = (upperWick + lowerWick) / (body || 0.001)

        const consolidating = this.isConsolidating()
        const rangeTightness = this.calculateRangeTightness()

        // 4. Structure signals
        const biasFlipped = this.getInternalBias() !== this.getTrendBias()
        const recentConfluence = this.lastConfluenceScore
        const weakStructure = recentConfluence < 40

        // 5. Calculate composite exhaustion score (0-100)
        let exhaustionScore = 0

        // Consecutive candles (0-25 points)
        const consecutive = Math.max(
            candlePatterns.consecutiveBullish,
            candlePatterns.consecutiveBearish,
        )
        exhaustionScore += Math.min(consecutive * 5, 25)

        // Volume declining (0-25 points)
        if (volumeTrend < -10) {
            exhaustionScore += 25 // Strongly declining
        } else if (volumeTrend < -5) {
            exhaustionScore += 20 // Declining
        } else if (volumeTrend < 0) {
            exhaustionScore += 10 // Slightly declining
        }

        // Price action (0-25 points)
        if (wickRatio > 3) {
            exhaustionScore += 25 // Very large wicks = strong rejection
        } else if (wickRatio > 2) {
            exhaustionScore += 20
        } else if (wickRatio > 1.5) {
            exhaustionScore += 15
        } else if (wickRatio > 1) {
            exhaustionScore += 10
        }

        // Structure divergence (0-25 points)
        if (biasFlipped) exhaustionScore += 15
        if (weakStructure) exhaustionScore += 10

        const exhaustionLevel: 'none' | 'low' | 'medium' | 'high' | 'extreme' =
            exhaustionScore >= 75
                ? 'extreme'
                : exhaustionScore >= 60
                  ? 'high'
                  : exhaustionScore >= 40
                    ? 'medium'
                    : exhaustionScore >= 20
                      ? 'low'
                      : 'none'

        return {
            consecutiveAgainst: {
                bullish: candlePatterns.consecutiveBullish,
                bearish: candlePatterns.consecutiveBearish,
                avgCandleSize,
                direction:
                    candlePatterns.consecutiveBullish > candlePatterns.consecutiveBearish
                        ? 'bullish'
                        : candlePatterns.consecutiveBearish > candlePatterns.consecutiveBullish
                          ? 'bearish'
                          : 'neutral',
            },
            volumeExhaustion: {
                isDeclining: volumeTrend < 0,
                declineRate: volumeTrend,
                comparedToAverage: volumeVsAvg,
            },
            priceAction: {
                wickRatio,
                consolidating,
                rangeTightness,
            },
            structureSignals: {
                biasFlipped,
                weakStructure,
                divergence: biasFlipped,
            },
            exhaustionScore,
            exhaustionLevel,
        }
    }

    /**
     * Update performance metrics
     */
    private updatePerformanceMetrics(updateTime: number): void {
        this.performanceMetrics.updateCount++
        this.performanceMetrics.totalUpdateTime += updateTime
        this.performanceMetrics.lastUpdateTime = updateTime
        this.performanceMetrics.averageUpdateTime =
            this.performanceMetrics.totalUpdateTime / this.performanceMetrics.updateCount

        if (updateTime > this.performanceMetrics.peakUpdateTime) {
            this.performanceMetrics.peakUpdateTime = updateTime
        }
    }

    /**
     * Get performance statistics
     */
    public getPerformanceStats() {
        return {
            ...this.performanceMetrics,
            memoryStats: this.getMemoryStats(),
            isPerformanceOptimal: this.performanceMetrics.averageUpdateTime < 10,
            recommendations: this.getPerformanceRecommendations(),
        }
    }

    /**
     * Get memory usage statistics
     */
    public getMemoryStats() {
        return {
            historyArrays: {
                length: this.highs.length,
                maxLength: this.MAX_HISTORY_LENGTH,
                memoryUsage: (this.highs.length * 5 * 8) / 1024 + ' KB',
            },
            orderBlocks: {
                swing: this.swingOrderBlocks.length,
                internal: this.internalOrderBlocks.length,
                maxPerType: this.MAX_ORDER_BLOCKS,
            },
            fairValueGaps: {
                count: this.fairValueGaps.length,
                maxCount: this.MAX_FAIR_VALUE_GAPS,
            },
        }
    }

    /**
     * Get performance optimization recommendations
     */
    private getPerformanceRecommendations(): string[] {
        const recommendations: string[] = []

        if (this.performanceMetrics.averageUpdateTime > 10) {
            recommendations.push('Consider reducing history length or order block limits')
        }

        if (this.highs.length > this.MAX_HISTORY_LENGTH * 0.8) {
            recommendations.push('History arrays are approaching maximum capacity')
        }

        if (
            this.swingOrderBlocks.length + this.internalOrderBlocks.length >
            this.MAX_ORDER_BLOCKS * 1.5
        ) {
            recommendations.push('Consider more aggressive order block cleanup')
        }

        if (this.fairValueGaps.length > this.MAX_FAIR_VALUE_GAPS * 0.8) {
            recommendations.push('Fair value gaps array is approaching capacity')
        }

        return recommendations
    }

    /**
     * Optimized bulk update method for backtesting
     */
    public updateBulk(
        candles: {
            high: number
            low: number
            open: number
            close: number
            time: number
            volume: number
        }[],
    ): Alerts[] {
        const results: Alerts[] = []
        const startTime = performance.now()

        // Disable some real-time features for bulk processing

        try {
            for (const candle of candles) {
                const alert = this.update(
                    candle.high,
                    candle.low,
                    candle.open,
                    candle.close,
                    candle.time,
                    candle.volume,
                )
                results.push(alert)
            }
        } finally {
            const totalTime = performance.now() - startTime
            logger.debug(
                `Bulk update completed: ${candles.length} candles in ${totalTime.toFixed(2)}ms (${(totalTime / candles.length).toFixed(2)}ms/candle)`,
            )
        }

        return results
    }

    /**
     * Clear all stored data
     */
    public clearAllData(): void {
        // Clear all arrays
        this.parsedHighs = []
        this.parsedLows = []
        this.highs = []
        this.lows = []
        this.closes = []
        this.times = []
        this.volumes = []
        this.liquidityGrabs = []
        this.swingOrderBlocks = []
        this.internalOrderBlocks = []
        this.fairValueGaps = []
        this.bearishOrderBlockMitigationSource = []
        this.bullishOrderBlockMitigationSource = []
        this.currentBarIndex = 0
        this.lastBarIndex = 0
        this.isNewBar = false
        this.initialTime = 0
        this.detectedUnicornPairs.clear() // Reset unicorn setup tracking

        // Reset pivots
        this.swingHigh = new Pivot()
        this.swingLow = new Pivot()
        this.internalHigh = new Pivot()
        this.internalLow = new Pivot()
        this.equalHigh = new EqualDisplay()
        this.equalLow = new EqualDisplay()

        // Reset trends
        this.swingTrend.bias = this.NEUTRAL
        this.internalTrend.bias = this.NEUTRAL

        // Reset leg state tracking
        this.legValues.clear()
        this.prevLegValues.clear()

        // Reset trailing extremes
        this.trailing = new TrailingExtremes()
    }

    /**
     * Get current configuration
     */
    public getConfiguration(): Partial<SmartMoneyConceptsConfig> {
        return {
            swingsLengthInput: this.swingsLengthInput,
            atrPeriod: this.atrPeriod,
            equalHighsLowsLengthInput: this.equalHighsLowsLengthInput,
            equalHighsLowsThresholdInput: this.equalHighsLowsThresholdInput,
            orderBlockFilterInput: this.orderBlockFilterInput,
            orderBlockMitigationInput: this.orderBlockMitigationInput,
            volumeThresholdInput: this.volumeThreshold,
            requireVolumeConfirmation: this.requireVolumeConfirmation,
        }
    }

    /**
     * Get Order Blocks for debugging (testing purposes)
     */
    public getOrderBlocks(): {
        swing: OrderBlock[]
        internal: OrderBlock[]
    } {
        return {
            swing: this.swingOrderBlocks,
            internal: this.internalOrderBlocks,
        }
    }

    /**
     * Phase 1: Classify Order Block as HP or Continuation
     * HP OBs create new structure (pivot highs/lows), Continuation OBs support trend
     */
    /**
     * Phase 3A: Classify Order Block with optional strict 5-criteria validation
     *
     * The 5 ICT Criteria for HP Order Blocks:
     * 1. ✅ Key Institutional Levels - Pivot highs/lows (already validated)
     * 2. ✅ Liquidity Sweep - Price swept stops before OB formation
     * 3. ✅ Change of State of Delivery (COSD) - Price traded through supporting candle's open
     * 4. ✅ Market Structure Shift - Creates new high/low
     * 5. ✅ Strong Displacement - Fair Value Gap formation (institutions agreed on price)
     */
    private classifyOrderBlockType(pivot: Pivot, internal: boolean, bias: number): OrderBlockType {
        // 1. Key Institutional Levels - Automatically met (we're at a pivot)
        // 4. Market Structure Shift - Check if this pivot created a new high or low
        const createsNewStructure = this.doesPivotCreateNewStructure(pivot, internal, bias)

        // 2. Liquidity Sweep - Check if liquidity was swept before formation
        const liquiditySwept = this.wasLiquiditySwept()

        // 3. COSD - Check if Change of State of Delivery occurred
        const cosdDetected = this.alerts.changeOfStateOfDelivery

        // 5. Strong Displacement - Check for recent FVG formation
        const hasFVG = this.hasRecentFVG(bias)

        // Strict 5-Criteria Validation (optional, default: false)
        if (this.strict5CriteriaValidation) {
            // ALL 5 criteria must be met for HP classification
            let criteriaMet = 0
            if (createsNewStructure) criteriaMet++ // Criterion 4
            if (liquiditySwept) criteriaMet++ // Criterion 2
            if (!this.requireCOSDForHP || cosdDetected) criteriaMet++ // Criterion 3
            if (!this.requireFVGForHP || hasFVG) criteriaMet++ // Criterion 5
            criteriaMet++ // Criterion 1 always met (we're at a pivot)

            // Require all 5 criteria for strict validation
            if (criteriaMet >= 5) {
                return OrderBlockType.HIGH_PROBABILITY
            }
        } else {
            // Relaxed validation (default): Require structure OR liquidity (not both)
            // Changed from AND to OR to allow more HP OBs to form in real market conditions
            if (createsNewStructure || liquiditySwept) {
                // Optional: Check COSD if required
                if (this.requireCOSDForHP && !cosdDetected) {
                    return OrderBlockType.CONTINUATION
                }
                // Optional: Check FVG if required
                if (this.requireFVGForHP && !hasFVG) {
                    return OrderBlockType.CONTINUATION
                }
                return OrderBlockType.HIGH_PROBABILITY
            }
        }

        // Otherwise, it's a Continuation OB
        return OrderBlockType.CONTINUATION
    }

    /**
     * Phase 1: Check if pivot creates new market structure
     */
    private doesPivotCreateNewStructure(pivot: Pivot, internal: boolean, bias: number): boolean {
        // For swing (not internal), this should create new high/low
        if (!internal) {
            // Compare current pivot level with historical extremes
            if (bias === this.BULLISH) {
                // Bullish OB forms at low - check if it's a new low
                return pivot.currentLevel <= Math.min(...this.lows.slice(-this.swingsLengthInput))
            } else {
                // Bearish OB forms at high - check if it's a new high
                return pivot.currentLevel >= Math.max(...this.highs.slice(-this.swingsLengthInput))
            }
        }
        return false // Internal OBs are always continuation
    }

    /**
     * Phase 1: Check if liquidity was recently swept
     * Uses the recent liquidity grab detection
     */
    private wasLiquiditySwept(): boolean {
        // Check if there was a recent liquidity grab
        return this.alerts.liquidityGrab || false
    }

    /**
     * Phase 3A: Check if there was a recent FVG formation with matching bias
     * This validates the "Strong Displacement" criterion for HP OBs
     */
    private hasRecentFVG(bias: number): boolean {
        if (this.fairValueGaps.length === 0) {
            return false
        }

        // Check if there's a recent FVG with matching bias
        // Look at the most recent FVGs (last 3)
        const recentFVGs = this.fairValueGaps.slice(-3)
        return recentFVGs.some(fvg => fvg.bias === bias)
    }

    /**
     * Phase 1: Detect Change of State of Delivery (COSD)
     * Price must trade through supporting candle's OPEN, not just high/low
     *
     * @param bias Current trend bias (BULLISH or BEARISH)
     * @param currentClose Current candle close
     * @returns true if COSD is detected
     */
    private detectCOSD(bias: number, currentClose: number): boolean {
        if (!this.enableCOSD || this.opens.length < 2) {
            return false
        }

        // For bullish reversal (price was going down, now reversing up):
        // Down candles were supporting, so check if price traded ABOVE their opens
        if (bias === this.BULLISH) {
            // Find the most recent down candle(s) that were supporting
            // Look back a few candles to find supporting down candles
            for (let i = Math.max(0, this.opens.length - 5); i < this.opens.length - 1; i++) {
                const open = this.opens[i]
                const close = this.closes[i]

                // If it's a down candle (close < open)
                if (close < open) {
                    // Check if current close traded ABOVE the down candle's open
                    if (currentClose > open) {
                        return true // COSD confirmed!
                    }
                }
            }
        }
        // For bearish reversal (price was going up, now reversing down):
        // Up candles were supporting, so check if price traded BELOW their opens
        else if (bias === this.BEARISH) {
            // Find the most recent up candle(s) that were supporting
            for (let i = Math.max(0, this.opens.length - 5); i < this.opens.length - 1; i++) {
                const open = this.opens[i]
                const close = this.closes[i]

                // If it's an up candle (close > open)
                if (close > open) {
                    // Check if current close traded BELOW the up candle's open
                    if (currentClose < open) {
                        return true // COSD confirmed!
                    }
                }
            }
        }

        return false
    }
}
