/**
 * OHLC candle data interface
 */
export interface Candle {
    time: number
    open: number
    high: number
    low: number
    close: number
    volume?: number
}

/**
 * Configuration interface for SmartMoneyConcepts
 */
export interface SmartMoneyConceptsConfig {
    swingsLengthInput?: number // Number of bars used to confirm swings
    equalHighsLowsLengthInput?: number // Bars used to confirm equal highs/lows
    equalHighsLowsThresholdInput?: number // Sensitivity threshold (0-0.5)
    internalOrderBlocksSizeInput?: number // Number of internal order blocks to track
    atrPeriod?: number // Period for ATR calculation (default: 14)
    swingOrderBlocksSizeInput?: number // Number of swing order blocks to track
    orderBlockFilterInput?: 'Atr' | 'Cumulative Mean Range' // Order block filter method
    orderBlockMitigationInput?: 'Close' | 'High/Low' // Mitigation detection method
    fairValueGapsThresholdInput?: boolean // Auto threshold for fair value gaps
    fairValueGapsExtendInput?: number // Number of bars to extend FVG
    internalFilterConfluenceInput?: boolean // Filter non-significant internal breakouts
    volumeThresholdInput?: number // Threshold for volume spikes (multiplier of avg volume)
    requireVolumeConfirmation?: boolean // Whether volume confirmation is required for signals

    // Phase 1 - ICT Methodology Enhancements
    onlyTradeFreshOBs?: boolean // Only trade fresh order blocks (never mitigated before)
    maxOBMitigations?: number // Maximum times an OB can be traded (0 = fresh only, 1 = first mitigation only)
    enableCOSD?: boolean // Enable Change of State of Delivery detection
    classifyOrderBlocks?: boolean // Enable HP vs Continuation OB classification

    // Phase 3A - ICT 5-Criteria HP OB Validation
    strict5CriteriaValidation?: boolean // Require all 5 ICT criteria for HP OBs (default: false)
    requireFVGForHP?: boolean // Require FVG (strong displacement) for HP OBs (default: false)
    requireCOSDForHP?: boolean // Require COSD for HP OBs (default: false)

    // Phase 3C - ATR-based OB Size Filtering
    minOBSizeATRMultiplier?: number // Minimum OB size as ATR multiplier (default: 0.3)
    maxOBSizeATRMultiplier?: number // Maximum OB size as ATR multiplier (default: 2.0)
    enableOBSizeFilter?: boolean // Enable ATR-based OB size filtering (default: false)
}

/**
 * Market trend direction
 */
export type TrendDirection = 'Bullish' | 'Bearish' | 'Neutral'

/**
 * Market structure type
 */
export type StructureType = 'BOS' | 'CHoCH'

export class Alerts {
    internalBullishBOS: boolean = false // Internal Bullish BOS formed
    internalBearishBOS: boolean = false // Internal Bearish BOS formed
    internalBullishCHoCH: boolean = false // Internal Bullish CHoCH formed
    internalBearishCHoCH: boolean = false // Internal Bearish CHoCH formed
    swingBullishBOS: boolean = false // Swing Bullish BOS formed
    swingBearishBOS: boolean = false // Swing Bearish BOS formed
    swingBullishCHoCH: boolean = false // Swing Bullish CHoCH formed
    swingBearishCHoCH: boolean = false // Swing Bearish CHoCH formed
    internalBullishObBrokenDown: boolean = false // Internal Bullish OB broken DOWN (bearish signal)
    internalBearishObBrokenUp: boolean = false // Internal Bearish OB broken UP (bullish signal)
    swingBullishObBrokenDown: boolean = false // Swing Bullish OB broken DOWN (bearish signal)
    swingBearishObBrokenUp: boolean = false // Swing Bearish OB broken UP (bullish signal)

    // Price is inside Order Blocks
    insideInternalBullishOrderBlock: boolean = false
    insideSwingBullishOrderBlock: boolean = false
    insideInternalBearishOrderBlock: boolean = false
    insideSwingBearishOrderBlock: boolean = false

    equalHighs: boolean = false // Equal highs detected
    equalLows: boolean = false // Equal lows detected
    bullishFairValueGap: boolean = false // Bullish Fair Value Gap detected
    bearishFairValueGap: boolean = false // Bearish Fair Value Gap detected
    liquidityGrab: boolean = false // Liquidity Grab detected
    volumeSpike: boolean = false // Volume Spike detected
    institutionalVolume: boolean = false // Institutional Volume detected
    sessionBreakout: boolean = false // Session Breakout detected

    // Phase 1 - ICT Methodology Enhancements
    changeOfStateOfDelivery: boolean = false // COSD - Price traded through supporting candle's open

    // Phase 2 - Breaker Blocks & The Unicorn
    breakerBlockFormed: boolean = false // HP OB failed and became Breaker
    unicornSetup: boolean = false // The Unicorn - Breaker + FVG alignment

    /**
     * Return a new object containing only the alert properties that are explicitly true.
     */
    getTrueAlerts(): Partial<Alerts> {
        return Object.fromEntries(
            Object.entries(this).filter(([, v]) => v === true),
        ) as Partial<Alerts>
    }
}

/**
 * Market bias/trend direction
 */
export enum TrendBias {
    BULLISH = 'Bullish',
    BEARISH = 'Bearish',
    NEUTRAL = 'Neutral',
}

/**
 * Price zones
 */
export enum Zone {
    PREMIUM = 'Premium',
    DISCOUNT = 'Discount',
    EQUILIBRIUM = 'Equilibrium',
}

/**
 * Premium/discount zone
 */
export type MarketZone = 'Premium' | 'Equilibrium' | 'Discount' | 'Unknown'

/**
 * Trailing extremes data structure
 */
export class TrailingExtremes {
    top: number = 0
    bottom: number = 0
    barTime: number = 0
    barIndex: number = 0
    lastTopTime: number = 0
    lastBottomTime: number = 0

    constructor() {
        this.top = 0
        this.bottom = 0
    }
}

/**
 * Fair value gap data structure
 */
export class FairValueGap {
    constructor(
        public top: number,
        public bottom: number,
        public bias: number,
        public topBoxId: string = '',
        public bottomBoxId: string = '',
    ) {}
}

/**
 * Trading session enumeration
 */
export enum TradingSession {
    ASIAN = 'Asian',
    LONDON = 'London',
    LONDON_NY_OVERLAP = 'London_NY_Overlap',
    NEW_YORK = 'NewYork',
    UNKNOWN = 'Unknown',
}

/**
 * Market Maker Model - Wyckoff Market Phases
 */
export enum MarketPhase {
    ACCUMULATION = 'Accumulation', // Institutions building positions
    MANIPULATION = 'Manipulation', // Stop hunting, liquidity grabs
    DISTRIBUTION = 'Distribution', // Institutions offloading
    REACCUMULATION = 'Reaccumulation', // Secondary accumulation
    MARKUP = 'Markup', // Price moving up after accumulation
    MARKDOWN = 'Markdown', // Price moving down after distribution
}

/**
 * Order Flow Signal Types
 */
export enum OrderFlowType {
    ABSORPTION = 'Absorption', // Large volume absorbed with little price movement
    EXHAUSTION = 'Exhaustion', // High volume with diminishing returns
    INITIATIVE = 'Initiative', // Institutional orders driving price
    RESPONSIVE = 'Responsive', // Market responding to institutional flow
}

/**
 * Market Maker Analysis Interface
 */
export interface MarketMakerAnalysis {
    currentPhase: MarketPhase
    phaseConfidence: number // 0-100
    expectedDirection: 'Up' | 'Down' | 'Sideways'
    targetZones: number[] // Likely price targets
    timeInPhase: number // Bars in current phase
    institutionalActivity: 'Low' | 'Medium' | 'High'
    volumeProfile: {
        averageVolume: number
        spikeThreshold: number
        institutionalThreshold: number
    }
}

/**
 * Order Flow Signal Interface
 */
export interface OrderFlowSignal {
    type: OrderFlowType
    strength: number // 0-100
    volume: number
    price: number
    time: number
    institutionalSignature: boolean
    followThroughProbability: number // 0-100
    context: string // Human readable explanation
}

/**
 * Trend data structure
 */
export class Trend {
    bias: number = 0

    constructor(initialBias: number = 0) {
        this.bias = initialBias
    }
}

/**
 * Equal display data structure
 */
export class EqualDisplay {
    active: boolean = false
    level: number = 0
    currentLevel: number = 0
    lastLevel: number = 0
    crossed: boolean = false
    barTime: number = 0
    barIndex: number = 0
}

/**
 * Pivot data structure
 */
export class Pivot {
    currentLevel: number = 0
    lastLevel: number = 0
    crossed: boolean = false
    barTime: number = 0
    barIndex: number = 0
}

/**
 * Order Block Type Classification (ICT Phase 1)
 */
export enum OrderBlockType {
    HIGH_PROBABILITY = 'hp', // At pivot highs/lows, sweeps liquidity, creates new structure
    CONTINUATION = 'continuation', // Within trend, supports trend continuation
    BREAKER = 'breaker', // Failed HP OB that flipped roles
    MITIGATION = 'mitigation', // Failed/incomplete OB
    RECLAIMED = 'reclaimed', // Failed Breaker/Mitigation that reverted (Phase 3C)
}

/**
 * Confluence scoring components
 */
export interface ConfluenceComponents {
    structureAlignment: number // 0-40 points
    volumeConfirmation: number // 0-25 points
    zoneAlignment: number // 0-25 points
    sessionTiming: number // 0-10 points
    liquidityContext: number // 0-10 points
    marketMakerAlignment: number // 0-15 points
}

/**
 * Liquidity grab data structure
 */
export class LiquidityGrab {
    constructor(
        public level: number,
        public volume: number,
        public time: number,
        public type: 'HighsGrab' | 'LowsGrab',
        public strength: 'Weak' | 'Strong' | 'Extreme',
        public followThrough: boolean = false,
        public barIndex: number = 0,
    ) {}
}

export class OrderBlock {
    public mitigated: boolean = false
    public mitigatedAt: number | null = null
    public wasMitigated: boolean = false // For test verification

    // Phase 1 - ICT Methodology Enhancements
    public mitigationCount: number = 0 // Number of times OB has been touched
    public firstMitigationTime: number | null = null // Timestamp of first mitigation
    public type: OrderBlockType = OrderBlockType.CONTINUATION // OB classification
    public createsNewStructure: boolean = false // Did this OB create new high/low?
    public sweptLiquidity: boolean = false // Was liquidity swept before OB formation?
    public open: number = 0 // Open price for COSD validation
    public close: number = 0 // Close price for MT calculation

    constructor(
        public barHigh: number,
        public barLow: number,
        public barTime: number,
        public bias: number,
        public volume: number = 0,
        public highVolume: boolean = false,
        public volumeStrength: number = 1.0,
        open?: number,
        close?: number,
    ) {
        // Initialize open/close if provided (for MT and COSD)
        this.open = open ?? barLow // Default to barLow for bullish, barHigh for bearish
        this.close = close ?? barHigh
    }

    equals(other: OrderBlock): boolean {
        return (
            this.barHigh === other.barHigh &&
            this.barLow === other.barLow &&
            this.barTime === other.barTime &&
            this.bias === other.bias &&
            this.volume === other.volume &&
            this.highVolume === other.highVolume &&
            this.volumeStrength === other.volumeStrength
        )
    }

    public hasBeenMitigated(): boolean {
        return this.mitigated || this.wasMitigated
    }

    public getMitigationLevel(): number {
        return this.bias === 1 ? this.barLow : this.barHigh
    }

    public isMitigatedBy(price: number): boolean {
        if (this.bias === 1) {
            return price < this.barLow
        } else {
            return price > this.barHigh
        }
    }

    public isFresh(): boolean {
        return this.mitigationCount === 0
    }

    public getPriority(): number {
        switch (this.type) {
            case OrderBlockType.BREAKER:
                return 10
            case OrderBlockType.HIGH_PROBABILITY:
                return 8
            case OrderBlockType.CONTINUATION:
                return 5
            case OrderBlockType.MITIGATION:
                return 3
            case OrderBlockType.RECLAIMED:
                return 1
            default:
                return 1
        }
    }

    public getMedianThreshold(): number {
        return (this.open + this.close) / 2
    }

    public recordMitigation(timestamp: number): void {
        this.mitigationCount++
        if (this.firstMitigationTime === null) {
            this.firstMitigationTime = timestamp
        }
    }
}
