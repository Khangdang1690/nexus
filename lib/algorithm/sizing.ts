import type { TargetPosition } from "@/app/types/algorithm";

/**
 * Equal-weight position sizing (1/n).
 * No leverage, no volatility targeting.
 */
export function calculateTargetWeights(
  selectedSymbols: string[],
  equity: number,
  currentPrices: Map<string, number>
): TargetPosition[] {
  const n = selectedSymbols.length;
  if (n === 0) return [];

  const weight = 1.0 / n;

  return selectedSymbols.map((symbol) => {
    const dollarAmount = weight * equity;
    const price = currentPrices.get(symbol) ?? 0;
    const shares = price > 0 ? Math.floor(dollarAmount / price) : 0;

    return {
      symbol,
      weight,
      dollarAmount,
      shares,
    };
  });
}
