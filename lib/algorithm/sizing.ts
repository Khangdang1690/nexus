import type { ScoredAsset, TargetPosition } from "@/app/types/algorithm";
import {
  SAFE_ASSET,
  LEVERAGED_3X,
  LEVERAGED_3X_CAP,
  TARGET_VOL,
} from "@/app/types/algorithm";

/**
 * Calculate target portfolio weights using volatility targeting.
 *
 * @param selectedSymbols - Symbols chosen by the scoring/selection engine
 * @param scores - Full scored asset list (for annualized vol data)
 * @param equity - Total account equity in dollars
 * @param currentPrices - Map of symbol → latest price for share calculation
 */
export function calculateTargetWeights(
  selectedSymbols: string[],
  scores: ScoredAsset[],
  equity: number,
  currentPrices: Map<string, number>
): TargetPosition[] {
  const targets: TargetPosition[] = [];
  let totalWeight = 0;

  // If 100% safe asset
  if (
    selectedSymbols.length === 1 &&
    selectedSymbols[0] === SAFE_ASSET
  ) {
    const price = currentPrices.get(SAFE_ASSET) ?? 0;
    return [
      {
        symbol: SAFE_ASSET,
        weight: 1.0,
        dollarAmount: equity,
        shares: price > 0 ? Math.floor(equity / price) : 0,
        isLeveraged3x: false,
      },
    ];
  }

  const scoreMap = new Map(scores.map((s) => [s.symbol, s]));
  const numPositions = selectedSymbols.length;

  for (const symbol of selectedSymbols) {
    const scored = scoreMap.get(symbol);
    if (!scored) continue;

    let weight: number;
    if (scored.annualizedVol > 0) {
      weight = TARGET_VOL / scored.annualizedVol / numPositions;
    } else {
      weight = 1.0 / numPositions;
    }

    // Cap leveraged 3x ETFs
    if (LEVERAGED_3X.includes(symbol)) {
      weight = Math.min(weight, LEVERAGED_3X_CAP);
    }

    weight = Math.min(weight, 1.0);

    const dollarAmount = weight * equity;
    const price = currentPrices.get(symbol) ?? 0;
    const shares = price > 0 ? Math.floor(dollarAmount / price) : 0;

    targets.push({
      symbol,
      weight,
      dollarAmount,
      shares,
      isLeveraged3x: LEVERAGED_3X.includes(symbol),
    });

    totalWeight += weight;
  }

  // Fill remainder with safe asset (BIL) if under 90% invested
  if (totalWeight < 0.90 && !selectedSymbols.includes(SAFE_ASSET)) {
    const remaining = 1.0 - totalWeight;
    const dollarAmount = remaining * equity;
    const price = currentPrices.get(SAFE_ASSET) ?? 0;
    targets.push({
      symbol: SAFE_ASSET,
      weight: remaining,
      dollarAmount,
      shares: price > 0 ? Math.floor(dollarAmount / price) : 0,
      isLeveraged3x: false,
    });
  }

  return targets;
}
