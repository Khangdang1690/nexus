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

// --- Monthly Data ---
export interface MonthlyClose {
  yearMonth: string; // "YYYY-MM"
  close: number;
}

export interface MonthlyReturn {
  yearMonth: string;
  monthlyReturn: number;
}

// --- Scoring ---
export interface ScoredAsset {
  symbol: string;
  vanillaMomentum: number; // 12-month cumulative return
  nnScore: number; // NN predicted probability (0-1)
  combinedScore: number; // 0.5 * vanilla + 0.5 * nn
}

// --- Position Sizing ---
export interface TargetPosition {
  symbol: string;
  weight: number;
  dollarAmount: number;
  shares: number;
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
  lastNNTraining: string | null;
  isRunning: boolean;
  schedulerActive: boolean;
}

// --- NN Model State ---
export interface NNModelState {
  modelJson: string;
  scalerMeans: number[];
  scalerStds: number[];
  trainedAt: string;
  trainingSamples: number;
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
  "AAPL", "MSFT", "GOOGL", "NVDA", "META", "AMZN", "TSLA",
  "AMD", "INTC", "QCOM", "AVGO", "TXN", "MU", "AMAT", "ORCL",
  "JPM", "BAC", "GS", "MS", "BLK", "C", "WFC", "AXP", "V", "MA",
  "JNJ", "UNH", "PFE", "ABBV", "MRK", "LLY", "TMO", "ABT",
  "PG", "KO", "PEP", "WMT", "COST", "MCD", "NKE", "SBUX",
  "XOM", "CVX", "COP", "CAT", "BA", "HON", "GE", "MMM",
  "HD", "DIS", "NFLX", "CRM", "ADBE", "PYPL",
] as const;

// TSMOM + NN parameters
export const FEATURE_MONTHS = 12;
export const TRAIN_WINDOW = 36;
export const TOP_PCT = 0.20;
export const NN_HIDDEN = 20;
export const WARMUP_BARS = 1200;
export const TRADING_DAYS_PER_YEAR = 252;
