import type {
  TargetPosition,
  RebalanceResult,
  OrderRecord,
  ScoredAsset,
  MonthlyReturn,
} from "@/app/types/algorithm";
import { UNIVERSE } from "@/app/types/algorithm";
import {
  refreshBars,
  getBarHistory,
  aggregateToMonthlyCloses,
  computeMonthlyReturns,
} from "@/lib/algorithm/bars";
import { scoreStock, trainNN, needsRetraining, getNNTrainedAt } from "@/lib/algorithm/nn";
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
 * Execute the full rebalance pipeline.
 */
export async function executeRebalance(
  triggerType: "scheduled" | "manual"
): Promise<RebalanceResult> {
  const timestamp = new Date().toISOString();
  const allSymbols = [...UNIVERSE];

  try {
    // 1. Refresh bar data
    console.log("[Algorithm] Refreshing bar data...");
    await refreshBars(allSymbols);

    // 2. Aggregate daily bars to monthly closes + compute monthly returns
    console.log("[Algorithm] Computing monthly returns...");
    const allMonthlyReturns = new Map<string, MonthlyReturn[]>();

    for (const symbol of UNIVERSE) {
      const bars = getBarHistory(symbol);
      const monthlyCloses = aggregateToMonthlyCloses(bars);
      const monthlyRets = computeMonthlyReturns(monthlyCloses);
      allMonthlyReturns.set(symbol, monthlyRets);
    }

    // 3. Train NN if needed (>28 days since last training or never trained)
    if (needsRetraining()) {
      console.log("[Algorithm] Training neural network...");
      trainNN(allMonthlyReturns);
    }

    // 4. Score each stock using hybrid TSMOM + NN
    console.log("[Algorithm] Scoring stocks...");
    const symbolScores = new Map<
      string,
      { vanillaMomentum: number; nnScore: number; combinedScore: number }
    >();

    for (const symbol of UNIVERSE) {
      const monthlyRets = allMonthlyReturns.get(symbol);
      if (!monthlyRets) continue;

      const score = scoreStock(monthlyRets);
      if (score) {
        symbolScores.set(symbol, score);
      }
    }

    // 5. Build sorted scores and select top 20%
    const scores: ScoredAsset[] = scoreAssets(symbolScores);
    const selectedSymbols = selectPositions(scores);
    console.log(
      "[Algorithm] Top scores:",
      scores
        .slice(0, 5)
        .map((s) => `${s.symbol}=${s.combinedScore.toFixed(4)}`)
        .join(", ")
    );
    console.log("[Algorithm] Selected positions:", selectedSymbols.join(", "));

    // 6. Get account info
    const account = await getAccount();
    const equity = account.equity;
    console.log(`[Algorithm] Account equity: $${equity.toFixed(2)}`);

    // 7. Build current price map from bar data
    const currentPrices = new Map<string, number>();
    for (const symbol of UNIVERSE) {
      const bars = getBarHistory(symbol, 1);
      if (bars.length > 0) {
        currentPrices.set(symbol, bars[bars.length - 1].close);
      }
    }

    // 8. Calculate equal-weight targets
    const targets = calculateTargetWeights(
      selectedSymbols,
      equity,
      currentPrices
    );
    console.log(
      "[Algorithm] Targets:",
      targets
        .map((t) => `${t.symbol}=${(t.weight * 100).toFixed(1)}%`)
        .join(", ")
    );

    // 9. Get current positions
    const currentPositions = await getPositions();

    // 10. Execute orders
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
        console.log(
          `[Algorithm] BUY ${delta} shares of ${target.symbol}`
        );
        const order = await submitMarketOrder(target.symbol, delta, "buy");
        ordersPlaced.push(order);
      } else {
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
      lastNNTraining: getNNTrainedAt(),
    });
  } catch (err) {
    console.error("[Algorithm] Failed to save state:", err);
  }
}
