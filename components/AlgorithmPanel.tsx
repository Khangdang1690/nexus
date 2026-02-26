"use client";

import { useAlgorithmStatus } from "@/hooks/useAlgorithmStatus";
import { AccountSummary } from "@/components/algorithm/AccountSummary";
import { ScoresTable } from "@/components/algorithm/ScoresTable";
import { PositionsTable } from "@/components/algorithm/PositionsTable";
import { RebalanceControls } from "@/components/algorithm/RebalanceControls";
import { RebalanceHistory } from "@/components/algorithm/RebalanceHistory";

export function AlgorithmPanel() {
  const {
    state,
    account,
    positions,
    rebalanceHistory,
    isLoading,
    error,
    triggerRebalance,
    isRebalancing,
  } = useAlgorithmStatus();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">
          Trading Algorithm
        </h2>
        <p className="text-sm text-muted-foreground">
          Loading algorithm status...
        </p>
      </div>
    );
  }

  // Derive selected symbols from targets
  const selectedSymbols = (state?.currentTargets ?? []).map(
    (t) => t.symbol
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">
          Trading Algorithm
        </h2>
        <p className="text-xs text-muted-foreground">
          Momentum-based strategy with volatility targeting. Auto-rebalances
          Monday 10:00 AM ET.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <AccountSummary account={account} />
        <RebalanceControls
          lastRebalance={state?.lastRebalance ?? null}
          nextScheduledRebalance={state?.nextScheduledRebalance ?? null}
          schedulerActive={state?.schedulerActive ?? false}
          isRunning={state?.isRunning ?? false}
          isRebalancing={isRebalancing}
          onRebalance={triggerRebalance}
        />
      </div>

      <PositionsTable
        positions={positions}
        targets={state?.currentTargets ?? []}
        equity={account?.equity ?? 0}
      />

      <ScoresTable
        scores={state?.latestScores ?? []}
        spyRegime={state?.spyRegime ?? null}
        selectedSymbols={selectedSymbols}
      />

      <RebalanceHistory history={rebalanceHistory} />
    </div>
  );
}
