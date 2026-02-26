import cron, { type ScheduledTask } from "node-cron";
import type { AlgorithmState, RebalanceResult } from "@/app/types/algorithm";
import { UNIVERSE, SPY } from "@/app/types/algorithm";
import { loadAlgorithmState, saveAlgorithmState } from "@/lib/db";
import { ensureBarsLoaded } from "@/lib/algorithm/bars";
import { executeRebalance } from "@/lib/algorithm/rebalance";
import { getClock } from "@/lib/alpaca/trading";

// Singleton state — survives Next.js hot reloads
const globalForAlgo = globalThis as typeof globalThis & {
  __algorithmState?: AlgorithmState;
  __cronTask?: ScheduledTask;
  __isRunning?: boolean;
};

function getDefaultState(): AlgorithmState {
  return {
    lastRebalance: null,
    nextScheduledRebalance: null,
    currentTargets: [],
    latestScores: [],
    spyRegime: null,
    isRunning: false,
    schedulerActive: false,
  };
}

/**
 * Initialize the algorithm: load state, warm up bars, start scheduler.
 * Called once from instrumentation.ts on server start.
 */
export async function initializeAlgorithm(): Promise<void> {
  // Load persisted state or create default
  const persisted = loadAlgorithmState();
  globalForAlgo.__algorithmState = persisted ?? getDefaultState();
  globalForAlgo.__algorithmState.schedulerActive = true;
  globalForAlgo.__isRunning = false;

  // Warm up bar data in the background (don't block server startup)
  const allSymbols = [...UNIVERSE, SPY];
  ensureBarsLoaded(allSymbols).catch((err) => {
    console.error("[Algorithm] Bar warmup failed:", err);
  });

  // Start cron job: Monday 10:00 AM ET (30 min after market open)
  // Skip if already running (hot reload in dev)
  if (!globalForAlgo.__cronTask) {
    globalForAlgo.__cronTask = cron.schedule(
      "0 10 * * 1",
      async () => {
        console.log("[Algorithm] Scheduled rebalance triggered");
        try {
          // Check if market is actually open (handles holidays)
          const clock = await getClock();
          if (!clock.isOpen) {
            console.log(
              "[Algorithm] Market is closed (holiday?), skipping scheduled rebalance"
            );
            return;
          }

          if (globalForAlgo.__isRunning) {
            console.log(
              "[Algorithm] Rebalance already in progress, skipping"
            );
            return;
          }

          globalForAlgo.__isRunning = true;
          if (globalForAlgo.__algorithmState) {
            globalForAlgo.__algorithmState.isRunning = true;
          }

          const result = await executeRebalance("scheduled");

          if (globalForAlgo.__algorithmState) {
            globalForAlgo.__algorithmState.lastRebalance = result.timestamp;
            globalForAlgo.__algorithmState.currentTargets = result.targets;
            globalForAlgo.__algorithmState.latestScores = result.scores;
            globalForAlgo.__algorithmState.spyRegime = result.spyRegime;
            globalForAlgo.__algorithmState.isRunning = false;
          }
        } catch (err) {
          console.error("[Algorithm] Scheduled rebalance error:", err);
        } finally {
          globalForAlgo.__isRunning = false;
          if (globalForAlgo.__algorithmState) {
            globalForAlgo.__algorithmState.isRunning = false;
          }
        }
      },
      { timezone: "America/New_York" }
    );

    console.log(
      "[Algorithm] Cron scheduler started: Monday 10:00 AM ET"
    );
  }

  // Compute next Monday 10:00 AM ET for display
  const now = new Date();
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7));
  nextMonday.setHours(10, 0, 0, 0);
  globalForAlgo.__algorithmState.nextScheduledRebalance =
    nextMonday.toISOString();
}

/**
 * Get current algorithm state for API consumers.
 */
export function getAlgorithmState(): AlgorithmState {
  return globalForAlgo.__algorithmState ?? getDefaultState();
}

/**
 * Trigger a manual rebalance. Bypasses threshold check.
 */
export async function triggerManualRebalance(): Promise<RebalanceResult> {
  if (globalForAlgo.__isRunning) {
    return {
      timestamp: new Date().toISOString(),
      triggerType: "manual",
      spyRegime: { sma200: null, lastClose: null, isBullish: false },
      scores: [],
      targets: [],
      ordersPlaced: [],
      accountEquity: 0,
      success: false,
      error: "Rebalance already in progress",
    };
  }

  globalForAlgo.__isRunning = true;
  if (globalForAlgo.__algorithmState) {
    globalForAlgo.__algorithmState.isRunning = true;
  }

  try {
    const result = await executeRebalance("manual");

    if (globalForAlgo.__algorithmState) {
      globalForAlgo.__algorithmState.lastRebalance = result.timestamp;
      globalForAlgo.__algorithmState.currentTargets = result.targets;
      globalForAlgo.__algorithmState.latestScores = result.scores;
      globalForAlgo.__algorithmState.spyRegime = result.spyRegime;
      globalForAlgo.__algorithmState.isRunning = false;
    }

    return result;
  } finally {
    globalForAlgo.__isRunning = false;
    if (globalForAlgo.__algorithmState) {
      globalForAlgo.__algorithmState.isRunning = false;
    }
  }
}
