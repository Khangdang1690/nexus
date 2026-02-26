import type {
  AlpacaPosition,
  TargetPosition,
  RebalanceResult,
  OrderRecord,
  ScoredAsset,
  SpyRegime,
  SymbolIndicators,
} from "@/app/types/algorithm";
import {
  UNIVERSE,
  SPY,
  REBALANCE_THRESHOLD,
} from "@/app/types/algorithm";
import { refreshBars, getBarHistory } from "@/lib/algorithm/bars";
import {
  computeAllIndicators,
  computeSpyRegime,
} from "@/lib/algorithm/indicators";
import { scoreAssets, selectPositions } from "@/lib/algorithm/scoring";
import { calculateTargetWeights } from "@/lib/algorithm/sizing";
import {
  getAccount,
  getPositions,
  submitMarketOrder,
  closePosition,
} from "@/lib/alpaca/trading";
import {
  saveAlgorithmState,
  insertRebalanceLog,
} from "@/lib/db";

/**
 * Check if rebalancing is needed based on deviation threshold.
 */
export function shouldRebalance(
  currentPositions: AlpacaPosition[],
  targets: TargetPosition[],
  equity: number
): boolean {
  if (equity <= 0) return false;

  const currentWeights = new Map(
    currentPositions.map((p) => [p.symbol, p.marketValue / equity])
  );

  // Check if any target deviates by more than threshold
  for (const target of targets) {
    const currentWeight = currentWeights.get(target.symbol) ?? 0;
    if (Math.abs(currentWeight - target.weight) > REBALANCE_THRESHOLD) {
      return true;
    }
  }

  // Check if we hold symbols not in targets
  const targetSymbols = new Set(targets.map((t) => t.symbol));
  for (const pos of currentPositions) {
    if (!targetSymbols.has(pos.symbol)) {
      return true;
    }
  }

  return false;
}

/**
 * Execute the full rebalance pipeline.
 */
export async function executeRebalance(
  triggerType: "scheduled" | "manual"
): Promise<RebalanceResult> {
  const timestamp = new Date().toISOString();
  const allSymbols = [...UNIVERSE, SPY];

  try {
    // 1. Refresh bar data
    console.log("[Algorithm] Refreshing bar data...");
    await refreshBars(allSymbols);

    // 2. Compute indicators for all universe symbols
    console.log("[Algorithm] Computing indicators...");
    const indicators = new Map<string, SymbolIndicators>();
    for (const symbol of UNIVERSE) {
      const bars = getBarHistory(symbol);
      if (bars.length > 0) {
        indicators.set(symbol, computeAllIndicators(bars));
      }
    }

    // 3. Compute SPY regime
    const spyBars = getBarHistory(SPY);
    const spyRegime: SpyRegime = computeSpyRegime(spyBars);
    console.log(
      `[Algorithm] SPY regime: ${spyRegime.isBullish ? "BULLISH" : "BEARISH"} (close=${spyRegime.lastClose}, sma200=${spyRegime.sma200?.toFixed(2)})`
    );

    // 4. Score and rank assets
    const scores: ScoredAsset[] = scoreAssets(indicators, spyRegime);
    console.log(
      "[Algorithm] Top scores:",
      scores
        .slice(0, 5)
        .map((s) => `${s.symbol}=${s.finalScore.toFixed(4)}`)
        .join(", ")
    );

    // 5. Select positions
    const selectedSymbols = selectPositions(scores, spyRegime);
    console.log("[Algorithm] Selected positions:", selectedSymbols.join(", "));

    // 6. Get account info
    const account = await getAccount();
    const equity = account.equity;
    console.log(`[Algorithm] Account equity: $${equity.toFixed(2)}`);

    // 7. Build current price map from bar data
    const currentPrices = new Map<string, number>();
    for (const symbol of [...UNIVERSE, SPY]) {
      const bars = getBarHistory(symbol, 1);
      if (bars.length > 0) {
        currentPrices.set(symbol, bars[bars.length - 1].close);
      }
    }

    // 8. Calculate target weights
    const targets = calculateTargetWeights(
      selectedSymbols,
      scores,
      equity,
      currentPrices
    );
    console.log(
      "[Algorithm] Targets:",
      targets.map((t) => `${t.symbol}=${(t.weight * 100).toFixed(1)}%`).join(", ")
    );

    // 9. Get current positions
    const currentPositions = await getPositions();

    // 10. Check if rebalance is needed
    const needsRebalance =
      triggerType === "manual" ||
      shouldRebalance(currentPositions, targets, equity);

    if (!needsRebalance) {
      console.log("[Algorithm] Positions within threshold, skipping rebalance");
      const result: RebalanceResult = {
        timestamp,
        triggerType,
        spyRegime,
        scores,
        targets,
        ordersPlaced: [],
        accountEquity: equity,
        success: true,
      };
      saveState(result);
      return result;
    }

    // 11. Execute orders
    console.log("[Algorithm] Executing rebalance...");
    const ordersPlaced: OrderRecord[] = [];

    // a. Close positions not in targets (sell first to free capital)
    const targetSymbolSet = new Set(targets.map((t) => t.symbol));
    for (const pos of currentPositions) {
      if (!targetSymbolSet.has(pos.symbol)) {
        console.log(`[Algorithm] Closing ${pos.symbol} (not in targets)`);
        await closePosition(pos.symbol);
        ordersPlaced.push({
          symbol: pos.symbol,
          side: "sell",
          qty: pos.qty,
          type: "market",
          status: "closed",
        });
      }
    }

    // b. Adjust existing and open new positions
    const currentPosMap = new Map(
      currentPositions.map((p) => [p.symbol, p])
    );

    for (const target of targets) {
      if (target.shares <= 0) continue;

      const current = currentPosMap.get(target.symbol);
      const currentShares = current?.qty ?? 0;
      const delta = target.shares - currentShares;

      if (delta === 0) continue;

      if (delta > 0) {
        // Need to buy more
        console.log(
          `[Algorithm] BUY ${delta} shares of ${target.symbol}`
        );
        const order = await submitMarketOrder(target.symbol, delta, "buy");
        ordersPlaced.push(order);
      } else {
        // Need to sell some
        const sellQty = Math.abs(delta);
        console.log(
          `[Algorithm] SELL ${sellQty} shares of ${target.symbol}`
        );
        const order = await submitMarketOrder(
          target.symbol,
          sellQty,
          "sell"
        );
        ordersPlaced.push(order);
      }
    }

    const result: RebalanceResult = {
      timestamp,
      triggerType,
      spyRegime,
      scores,
      targets,
      ordersPlaced,
      accountEquity: equity,
      success: true,
    };

    saveState(result);
    console.log(
      `[Algorithm] Rebalance complete. ${ordersPlaced.length} orders placed.`
    );
    return result;
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Unknown error";
    console.error("[Algorithm] Rebalance failed:", errorMsg);

    const result: RebalanceResult = {
      timestamp,
      triggerType,
      spyRegime: { sma200: null, lastClose: null, isBullish: false },
      scores: [],
      targets: [],
      ordersPlaced: [],
      accountEquity: 0,
      success: false,
      error: errorMsg,
    };

    try {
      insertRebalanceLog(result);
    } catch {
      // Don't let logging failure mask the original error
    }

    return result;
  }
}

function saveState(result: RebalanceResult): void {
  try {
    insertRebalanceLog(result);
    saveAlgorithmState({
      lastRebalance: result.timestamp,
      currentTargets: result.targets,
      latestScores: result.scores,
      spyRegime: result.spyRegime,
    });
  } catch (err) {
    console.error("[Algorithm] Failed to save state:", err);
  }
}
