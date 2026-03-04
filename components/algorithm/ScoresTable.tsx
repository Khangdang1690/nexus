"use client";

import type { ScoredAsset } from "@/app/types/algorithm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

interface ScoresTableProps {
  scores: ScoredAsset[];
  selectedSymbols: string[];
}

export function ScoresTable({
  scores,
  selectedSymbols,
}: ScoresTableProps) {
  const selected = new Set(selectedSymbols);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <BarChart3 className="h-4 w-4" />
          Asset Scores
        </CardTitle>
      </CardHeader>
      <CardContent>
        {scores.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No scores computed yet. Trigger a rebalance to compute.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-1.5 text-left font-medium">Symbol</th>
                  <th className="py-1.5 text-right font-medium">12m Mom</th>
                  <th className="py-1.5 text-right font-medium">NN Score</th>
                  <th className="py-1.5 text-right font-medium">Combined</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr
                    key={s.symbol}
                    className={`border-b last:border-0 ${
                      selected.has(s.symbol) ? "bg-emerald-500/10" : ""
                    }`}
                  >
                    <td className="py-1.5 font-medium">
                      {s.symbol}
                      {selected.has(s.symbol) && (
                        <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      )}
                    </td>
                    <td
                      className={`py-1.5 text-right ${
                        s.vanillaMomentum >= 0
                          ? "text-emerald-500"
                          : "text-red-500"
                      }`}
                    >
                      {(s.vanillaMomentum * 100).toFixed(2)}%
                    </td>
                    <td className="py-1.5 text-right">
                      {s.nnScore.toFixed(3)}
                    </td>
                    <td
                      className={`py-1.5 text-right font-medium ${
                        s.combinedScore > 0
                          ? "text-emerald-500"
                          : "text-red-500"
                      }`}
                    >
                      {s.combinedScore.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
