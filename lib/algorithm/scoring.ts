import type { SymbolIndicators, SpyRegime, ScoredAsset } from "@/app/types/algorithm";
import {
  UNIVERSE,
  SAFE_ASSET,
  DEFENSIVE_ASSET,
  MAX_POSITIONS,
  ROC_FAST_WEIGHT,
  ROC_MED_WEIGHT,
  ROC_SLOW_WEIGHT,
  ABOVE_SMA_FACTOR,
  BELOW_SMA_FACTOR,
  TRADING_DAYS_PER_YEAR,
} from "@/app/types/algorithm";

/**
 * Score all assets by risk-adjusted momentum with trend filtering.
 * Returns sorted descending by finalScore.
 */
export function scoreAssets(
  indicators: Map<string, SymbolIndicators>,
  spyRegime: SpyRegime
): ScoredAsset[] {
  const scores: ScoredAsset[] = [];

  for (const symbol of UNIVERSE) {
    if (symbol === SAFE_ASSET) continue;

    const ind = indicators.get(symbol);
    if (!ind) continue;
    if (
      ind.rocSlow === null ||
      ind.rocFast === null ||
      ind.rocMed === null ||
      ind.stdDev === null
    )
      continue;

    const fast = ind.rocFast;
    const med = ind.rocMed;
    const slow = ind.rocSlow;
    let vol = ind.stdDev;

    if (vol === 0) vol = 1.0;

    const weightedMom =
      fast * ROC_FAST_WEIGHT + med * ROC_MED_WEIGHT + slow * ROC_SLOW_WEIGHT;
    const riskAdjMom = weightedMom / vol;
    const trendFactor =
      ind.lastClose !== null &&
      ind.sma50 !== null &&
      ind.lastClose > ind.sma50
        ? ABOVE_SMA_FACTOR
        : BELOW_SMA_FACTOR;
    const finalScore = riskAdjMom * trendFactor;

    // Annualized vol from daily std dev
    const annualizedVol = vol * Math.sqrt(TRADING_DAYS_PER_YEAR);

    scores.push({
      symbol,
      weightedMom,
      riskAdjMom,
      trendFactor,
      finalScore,
      annualizedVol,
    });
  }

  return scores.sort((a, b) => b.finalScore - a.finalScore);
}

/**
 * Select which positions to hold based on scores and SPY regime.
 * Returns list of selected symbols.
 */
export function selectPositions(
  scores: ScoredAsset[],
  spyRegime: SpyRegime
): string[] {
  const targetPositions: string[] = [];

  // Pick top assets with score > 0 when SPY is bullish
  for (const asset of scores) {
    if (asset.finalScore > 0 && spyRegime.isBullish) {
      targetPositions.push(asset.symbol);
      if (targetPositions.length >= MAX_POSITIONS) break;
    }
  }

  // If not enough positions or bearish, consider UUP as defensive
  if (
    !spyRegime.isBullish ||
    targetPositions.length < MAX_POSITIONS
  ) {
    const uupScore = scores.find((s) => s.symbol === DEFENSIVE_ASSET);
    if (
      uupScore &&
      uupScore.finalScore > 0 &&
      !targetPositions.includes(DEFENSIVE_ASSET)
    ) {
      targetPositions.push(DEFENSIVE_ASSET);
    }
  }

  // If nothing qualifies, go to safe asset
  if (targetPositions.length === 0) {
    return [SAFE_ASSET];
  }

  return targetPositions;
}
