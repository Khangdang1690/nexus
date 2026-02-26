// --- Bar Data ---
export interface DailyBar {
  symbol: string;
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// --- Indicators ---
export interface SymbolIndicators {
  symbol: string;
  rocFast: number | null;
  rocMed: number | null;
  rocSlow: number | null;
  stdDev: number | null;
  rsi: number | null;
  sma50: number | null;
  lastClose: number | null;
}

export interface SpyRegime {
  sma200: number | null;
  lastClose: number | null;
  isBullish: boolean;
}

// --- Scoring ---
export interface ScoredAsset {
  symbol: string;
  weightedMom: number;
  riskAdjMom: number;
  trendFactor: number;
  finalScore: number;
  annualizedVol: number;
}

// --- Position Sizing ---
export interface TargetPosition {
  symbol: string;
  weight: number;
  dollarAmount: number;
  shares: number;
  isLeveraged3x: boolean;
}

// --- Orders ---
export interface OrderRecord {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  type: "market";
  status: string;
}

// --- Rebalance ---
export interface RebalanceResult {
  timestamp: string;
  triggerType: "scheduled" | "manual";
  spyRegime: SpyRegime;
  scores: ScoredAsset[];
  targets: TargetPosition[];
  ordersPlaced: OrderRecord[];
  accountEquity: number;
  success: boolean;
  error?: string;
}

// --- Algorithm State ---
export interface AlgorithmState {
  lastRebalance: string | null;
  nextScheduledRebalance: string | null;
  currentTargets: TargetPosition[];
  latestScores: ScoredAsset[];
  spyRegime: SpyRegime | null;
  isRunning: boolean;
  schedulerActive: boolean;
}

// --- Alpaca Account ---
export interface AlpacaAccount {
  id: string;
  equity: number;
  cash: number;
  buyingPower: number;
  portfolioValue: number;
  status: string;
}

export interface AlpacaPosition {
  symbol: string;
  qty: number;
  side: string;
  marketValue: number;
  costBasis: number;
  unrealizedPl: number;
  unrealizedPlpc: number;
  currentPrice: number;
}

export interface AlpacaClock {
  timestamp: string;
  isOpen: boolean;
  nextOpen: string;
  nextClose: string;
}

// --- Constants ---
export const UNIVERSE = [
  "SOXL", "TECL", "TQQQ", "FAS", "ERX",
  "UUP", "TMF", "BIL", "TSLA", "XOM",
  "CVX", "ROBO", "ARKX", "MSFT", "GOOGL",
  "META", "BOIL", "LABU", "ARKG",
] as const;

export const SPY = "SPY";
export const SAFE_ASSET = "BIL";
export const DEFENSIVE_ASSET = "UUP";
export const LEVERAGED_3X = ["SOXL", "TECL", "TQQQ", "FAS", "ERX", "LABU"];
export const MAX_POSITIONS = 3;
export const TARGET_VOL = 0.60;
export const LEVERAGED_3X_CAP = 0.50;
export const REBALANCE_THRESHOLD = 0.10;

// Indicator periods
export const ROC_FAST_PERIOD = 9;
export const ROC_MED_PERIOD = 21;
export const ROC_SLOW_PERIOD = 63;
export const STD_PERIOD = 21;
export const RSI_PERIOD = 14;
export const SMA_PERIOD = 50;
export const SPY_SMA_PERIOD = 200;
export const WARMUP_BARS = 300;

// Scoring weights
export const ROC_FAST_WEIGHT = 0.40;
export const ROC_MED_WEIGHT = 0.35;
export const ROC_SLOW_WEIGHT = 0.25;
export const ABOVE_SMA_FACTOR = 1.0;
export const BELOW_SMA_FACTOR = 0.6;
export const TRADING_DAYS_PER_YEAR = 252;

// Volatility lookback for position sizing
export const VOL_LOOKBACK = 20;
