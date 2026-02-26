import type { DailyBar, SymbolIndicators, SpyRegime } from "@/app/types/algorithm";
import {
  ROC_FAST_PERIOD,
  ROC_MED_PERIOD,
  ROC_SLOW_PERIOD,
  STD_PERIOD,
  RSI_PERIOD,
  SMA_PERIOD,
  SPY_SMA_PERIOD,
  TRADING_DAYS_PER_YEAR,
} from "@/app/types/algorithm";

/**
 * Rate of Change: (current - past) / past
 * Returns percentage as a decimal (not multiplied by 100)
 */
export function computeROC(
  closes: number[],
  period: number
): number | null {
  if (closes.length <= period) return null;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - period];
  if (past === 0) return null;
  return (current - past) / past;
}

/**
 * Simple Moving Average of the last `period` values
 */
export function computeSMA(
  closes: number[],
  period: number
): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Population standard deviation of the last `period` values
 */
export function computeStdDev(
  closes: number[],
  period: number
): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance =
    slice.reduce((sum, val) => sum + (val - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

/**
 * RSI with Wilders smoothing (standard RSI)
 * Needs at least `period + 1` closes for the initial SMA seed,
 * then applies Wilders exponential smoothing for the rest.
 */
export function computeRSI(
  closes: number[],
  period: number
): number | null {
  if (closes.length < period + 1) return null;

  // Compute price changes
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Initial average gain/loss from first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilders smoothing for the rest
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Annualized volatility from daily returns over `period` trading days.
 * Needs `period + 1` closes to compute `period` returns.
 */
export function computeAnnualizedVol(
  closes: number[],
  period: number
): number | null {
  if (closes.length < period + 1) return null;

  const slice = closes.slice(-(period + 1));
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1] === 0) continue;
    returns.push(slice[i] / slice[i - 1] - 1);
  }

  if (returns.length === 0) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * Compute all indicators for a single symbol from its daily bars.
 * Bars must be sorted by date ascending.
 */
export function computeAllIndicators(bars: DailyBar[]): SymbolIndicators {
  const closes = bars.map((b) => b.close);
  const symbol = bars.length > 0 ? bars[0].symbol : "";

  return {
    symbol,
    rocFast: computeROC(closes, ROC_FAST_PERIOD),
    rocMed: computeROC(closes, ROC_MED_PERIOD),
    rocSlow: computeROC(closes, ROC_SLOW_PERIOD),
    stdDev: computeStdDev(closes, STD_PERIOD),
    rsi: computeRSI(closes, RSI_PERIOD),
    sma50: computeSMA(closes, SMA_PERIOD),
    lastClose: closes.length > 0 ? closes[closes.length - 1] : null,
  };
}

/**
 * Compute the SPY regime filter (SMA 200).
 */
export function computeSpyRegime(spyBars: DailyBar[]): SpyRegime {
  const closes = spyBars.map((b) => b.close);
  const sma200 = computeSMA(closes, SPY_SMA_PERIOD);
  const lastClose = closes.length > 0 ? closes[closes.length - 1] : null;

  return {
    sma200,
    lastClose,
    isBullish: sma200 !== null && lastClose !== null && lastClose > sma200,
  };
}
