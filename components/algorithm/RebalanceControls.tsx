"use client";

import { useState } from "react";
import type { RebalanceResult } from "@/app/types/algorithm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Clock } from "lucide-react";

interface RebalanceControlsProps {
  lastRebalance: string | null;
  nextScheduledRebalance: string | null;
  schedulerActive: boolean;
  isRunning: boolean;
  isRebalancing: boolean;
  onRebalance: () => Promise<RebalanceResult | null>;
}

function formatTime(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function RebalanceControls({
  lastRebalance,
  nextScheduledRebalance,
  schedulerActive,
  isRunning,
  isRebalancing,
  onRebalance,
}: RebalanceControlsProps) {
  const [confirmed, setConfirmed] = useState(false);

  const handleClick = async () => {
    if (!confirmed) {
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 3000);
      return;
    }
    setConfirmed(false);
    await onRebalance();
  };

  const busy = isRunning || isRebalancing;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Clock className="h-4 w-4" />
          Rebalance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Last Rebalance</p>
            <p className="font-medium">{formatTime(lastRebalance)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Next Scheduled</p>
            <p className="font-medium">
              {formatTime(nextScheduledRebalance)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleClick}
            disabled={busy}
            variant={confirmed ? "destructive" : "default"}
            size="sm"
          >
            <RefreshCw
              className={`mr-2 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`}
            />
            {busy
              ? "Running..."
              : confirmed
                ? "Confirm Rebalance"
                : "Rebalance Now"}
          </Button>

          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={`h-2 w-2 rounded-full ${
                schedulerActive
                  ? "bg-emerald-500 animate-pulse"
                  : "bg-muted-foreground"
              }`}
            />
            Scheduler {schedulerActive ? "active" : "inactive"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
