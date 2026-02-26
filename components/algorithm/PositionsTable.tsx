"use client";

import type { AlpacaPosition, TargetPosition } from "@/app/types/algorithm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase } from "lucide-react";

interface PositionsTableProps {
  positions: AlpacaPosition[];
  targets: TargetPosition[];
  equity: number;
}

export function PositionsTable({
  positions,
  targets,
  equity,
}: PositionsTableProps) {
  const targetMap = new Map(targets.map((t) => [t.symbol, t]));
  const posMap = new Map(positions.map((p) => [p.symbol, p]));

  // Combine all symbols from both positions and targets
  const allSymbols = new Set([
    ...positions.map((p) => p.symbol),
    ...targets.map((t) => t.symbol),
  ]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Briefcase className="h-4 w-4" />
          Positions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {allSymbols.size === 0 ? (
          <p className="text-sm text-muted-foreground">No positions</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-1.5 text-left font-medium">Symbol</th>
                  <th className="py-1.5 text-right font-medium">Shares</th>
                  <th className="py-1.5 text-right font-medium">Value</th>
                  <th className="py-1.5 text-right font-medium">Actual%</th>
                  <th className="py-1.5 text-right font-medium">Target%</th>
                  <th className="py-1.5 text-right font-medium">P&L</th>
                </tr>
              </thead>
              <tbody>
                {[...allSymbols].map((symbol) => {
                  const pos = posMap.get(symbol);
                  const target = targetMap.get(symbol);
                  const actualWeight =
                    pos && equity > 0
                      ? (pos.marketValue / equity) * 100
                      : 0;
                  const targetWeight = target
                    ? target.weight * 100
                    : 0;
                  const deviation = Math.abs(
                    actualWeight - targetWeight
                  );

                  return (
                    <tr key={symbol} className="border-b last:border-0">
                      <td className="py-1.5 font-medium">{symbol}</td>
                      <td className="py-1.5 text-right">
                        {pos?.qty.toFixed(0) ?? "0"}
                      </td>
                      <td className="py-1.5 text-right">
                        ${pos?.marketValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? "0"}
                      </td>
                      <td className="py-1.5 text-right">
                        {actualWeight.toFixed(1)}%
                      </td>
                      <td className="py-1.5 text-right">
                        {targetWeight.toFixed(1)}%
                      </td>
                      <td
                        className={`py-1.5 text-right ${
                          pos && pos.unrealizedPl >= 0
                            ? "text-emerald-500"
                            : "text-red-500"
                        }`}
                      >
                        {pos
                          ? `${pos.unrealizedPl >= 0 ? "+" : ""}$${pos.unrealizedPl.toFixed(2)}`
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
