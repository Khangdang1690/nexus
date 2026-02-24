"use client";

import type { StockData } from "@/app/types/stock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StockCardProps {
  data: StockData;
}

function formatTime(isoString: string | null): string {
  if (!isoString) return "--";
  try {
    return new Date(isoString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return "--";
  }
}

export function StockCard({ data }: StockCardProps) {
  const {
    symbol,
    lastPrice,
    previousPrice,
    lastTradeSize,
    lastTradeTime,
    bidPrice,
    askPrice,
    bidSize,
    askSize,
    lastQuoteTime,
  } = data;

  const priceDirection =
    lastPrice !== null && previousPrice !== null
      ? lastPrice > previousPrice
        ? "up"
        : lastPrice < previousPrice
          ? "down"
          : "unchanged"
      : "unchanged";

  const priceColorClass =
    priceDirection === "up"
      ? "text-emerald-500"
      : priceDirection === "down"
        ? "text-red-500"
        : "text-card-foreground";

  const priceArrow =
    priceDirection === "up" ? "\u25B2" : priceDirection === "down" ? "\u25BC" : "";

  const spread =
    bidPrice !== null && askPrice !== null
      ? (askPrice - bidPrice).toFixed(4)
      : null;

  const hasData = lastPrice !== null || bidPrice !== null;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{symbol}</CardTitle>
          {hasData && (
            <span className="text-xs text-muted-foreground">
              {formatTime(lastTradeTime || lastQuoteTime)}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {!hasData ? (
          <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
            Waiting for market data...
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className={`text-3xl font-semibold tabular-nums ${priceColorClass}`}>
                {lastPrice !== null ? (
                  <>
                    ${lastPrice.toFixed(2)}{" "}
                    <span className="text-base">{priceArrow}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">--</span>
                )}
              </div>
              {lastTradeSize !== null && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Last trade: {lastTradeSize.toLocaleString()} shares
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3 text-sm">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Bid</div>
                <div className="tabular-nums text-emerald-600 dark:text-emerald-400">
                  {bidPrice !== null ? `$${bidPrice.toFixed(2)}` : "--"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {bidSize !== null ? `${bidSize.toLocaleString()} shares` : ""}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Ask</div>
                <div className="tabular-nums text-red-500 dark:text-red-400">
                  {askPrice !== null ? `$${askPrice.toFixed(2)}` : "--"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {askSize !== null ? `${askSize.toLocaleString()} shares` : ""}
                </div>
              </div>
            </div>

            {spread !== null && (
              <div className="mt-2 text-center text-xs text-muted-foreground">
                Spread: ${spread}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
