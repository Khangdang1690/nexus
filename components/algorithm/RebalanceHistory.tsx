"use client";

import { useState } from "react";
import type { RebalanceResult } from "@/app/types/algorithm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, ChevronDown, ChevronRight } from "lucide-react";

interface RebalanceHistoryProps {
  history: RebalanceResult[];
}

export function RebalanceHistory({ history }: RebalanceHistoryProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <History className="h-4 w-4" />
          Rebalance History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rebalance history yet.
          </p>
        ) : (
          <div className="space-y-1">
            {history.map((entry, i) => {
              const isExpanded = expandedIndex === i;
              return (
                <div key={`${entry.timestamp}-${i}`} className="border-b last:border-0">
                  <button
                    className="flex w-full items-center gap-2 py-2 text-left text-xs hover:bg-muted/50"
                    onClick={() =>
                      setExpandedIndex(isExpanded ? null : i)
                    }
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    )}
                    <span className="text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                    <Badge
                      variant={entry.success ? "secondary" : "destructive"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {entry.success ? "OK" : "FAIL"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {entry.triggerType}
                    </Badge>
                    <span className="ml-auto text-muted-foreground">
                      {entry.ordersPlaced.length} orders
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="pb-2 pl-5 text-xs text-muted-foreground space-y-1">
                      <p>
                        Equity: $
                        {entry.accountEquity.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                      <p>
                        SPY:{" "}
                        {entry.spyRegime.isBullish
                          ? "Bullish"
                          : "Bearish"}
                      </p>
                      <p>
                        Targets:{" "}
                        {entry.targets
                          .map(
                            (t) =>
                              `${t.symbol} ${(t.weight * 100).toFixed(0)}%`
                          )
                          .join(", ")}
                      </p>
                      {entry.ordersPlaced.length > 0 && (
                        <p>
                          Orders:{" "}
                          {entry.ordersPlaced
                            .map(
                              (o) =>
                                `${o.side.toUpperCase()} ${o.qty} ${o.symbol}`
                            )
                            .join(", ")}
                        </p>
                      )}
                      {entry.error && (
                        <p className="text-red-500">Error: {entry.error}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
