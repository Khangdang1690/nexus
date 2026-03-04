import type { ScoredAsset } from "@/app/types/algorithm";
import { TOP_PCT } from "@/app/types/algorithm";

/**
 * Build sorted ScoredAsset array from per-symbol scores.
 * Returns sorted descending by combinedScore.
 */
export function scoreAssets(
  symbolScores: Map<
    string,
    { vanillaMomentum: number; nnScore: number; combinedScore: number }
  >
): ScoredAsset[] {
  const scores: ScoredAsset[] = [];

  for (const [symbol, s] of symbolScores) {
    scores.push({
      symbol,
      vanillaMomentum: s.vanillaMomentum,
      nnScore: s.nnScore,
      combinedScore: s.combinedScore,
    });
  }

  return scores.sort((a, b) => b.combinedScore - a.combinedScore);
}

/**
 * Select top 20% of scored assets.
 * Returns list of selected symbols.
 */
export function selectPositions(scores: ScoredAsset[]): string[] {
  if (scores.length < 5) return scores.map((s) => s.symbol);
  const n = Math.max(1, Math.round(scores.length * TOP_PCT));
  return scores.slice(0, n).map((s) => s.symbol);
}
