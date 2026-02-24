"use client";

import { useState, useCallback } from "react";
import { useStockStream } from "@/hooks/useStockStream";
import { StockCard } from "@/components/StockCard";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { SymbolInput } from "@/components/SymbolInput";
import { Card, CardContent } from "@/components/ui/card";

const DEFAULT_SYMBOLS = ["AAPL", "GOOGL", "MSFT", "TSLA", "AMZN"];

export function StockDashboard() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);

  const handleAddSymbol = useCallback((symbol: string) => {
    setSymbols((prev) => (prev.includes(symbol) ? prev : [...prev, symbol]));
  }, []);

  const handleRemoveSymbol = useCallback((symbol: string) => {
    setSymbols((prev) => prev.filter((s) => s !== symbol));
  }, []);

  const { stocks, status, statusMessage, error } = useStockStream(symbols);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock Monitor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time trades & quotes via Alpaca IEX
          </p>
        </div>
        <ConnectionStatusBadge status={status} message={statusMessage} />
      </div>

      {error && (
        <Card className="mb-6 border-destructive/50 bg-destructive/10">
          <CardContent className="text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="mb-8">
        <SymbolInput
          onAddSymbol={handleAddSymbol}
          onRemoveSymbol={handleRemoveSymbol}
          activeSymbols={symbols}
        />
      </div>

      <p className="mb-6 text-xs text-muted-foreground">
        Market data streams during US market hours: 9:30 AM - 4:00 PM ET,
        Monday-Friday. Outside these hours, cards will show &ldquo;Waiting for
        market data.&rdquo;
      </p>

      {symbols.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          Add a stock symbol above to start monitoring.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {symbols.map((symbol) => {
            const stockData = stocks.get(symbol) || {
              symbol,
              lastPrice: null,
              previousPrice: null,
              lastTradeSize: null,
              lastTradeTime: null,
              bidPrice: null,
              bidSize: null,
              askPrice: null,
              askSize: null,
              lastQuoteTime: null,
            };
            return <StockCard key={symbol} data={stockData} />;
          })}
        </div>
      )}
    </div>
  );
}
