"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { SSEEvent, StockData, ConnectionStatus } from "@/app/types/stock";

const INITIAL_STOCK_DATA: Omit<StockData, "symbol"> = {
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

interface UseStockStreamReturn {
  stocks: Map<string, StockData>;
  status: ConnectionStatus;
  statusMessage: string;
  subscribedSymbols: string[];
  error: string | null;
}

export function useStockStream(symbols: string[]): UseStockStreamReturn {
  const [stocks, setStocks] = useState<Map<string, StockData>>(new Map());
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [statusMessage, setStatusMessage] = useState("");
  const [subscribedSymbols, setSubscribedSymbols] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);

  const symbolsKey = symbols.sort().join(",");

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (!symbolsKey) {
      setStatus("disconnected");
      setStocks(new Map());
      return;
    }

    setStatus("connecting");
    setError(null);

    setStocks((prev) => {
      const next = new Map(prev);
      for (const symbol of symbolsKey.split(",")) {
        if (!next.has(symbol)) {
          next.set(symbol, { symbol, ...INITIAL_STOCK_DATA });
        }
      }
      return next;
    });

    // Fetch cached snapshots from SQLite (non-blocking, runs in parallel with stream)
    fetch(`/api/stocks/snapshot?symbols=${encodeURIComponent(symbolsKey)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: StockData[]) => {
        if (data.length > 0) {
          setStocks((prev) => {
            const next = new Map(prev);
            for (const stock of data) {
              const existing = next.get(stock.symbol);
              // Only use cached data if we don't have live data yet
              if (!existing || existing.lastPrice === null) {
                next.set(stock.symbol, stock);
              }
            }
            return next;
          });
        }
      })
      .catch(() => {
        // Non-fatal: the SSE stream will provide data eventually
      });

    const url = `/api/stocks/stream?symbols=${encodeURIComponent(symbolsKey)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      reconnectAttemptRef.current = 0;
    };

    es.onmessage = (event: MessageEvent) => {
      try {
        const data: SSEEvent = JSON.parse(event.data);

        switch (data.type) {
          case "status":
            setStatusMessage(data.message);
            if (data.status === "authenticated" || data.status === "subscribed") {
              setStatus("connected");
            }
            if (data.status === "subscribed" && data.subscribedSymbols) {
              setSubscribedSymbols(data.subscribedSymbols);
            }
            if (data.status === "error") {
              setError(data.message);
            }
            if (data.status === "disconnected") {
              setStatus("disconnected");
            }
            break;

          case "trade":
            setStocks((prev) => {
              const next = new Map(prev);
              const existing = next.get(data.symbol) || {
                symbol: data.symbol,
                ...INITIAL_STOCK_DATA,
              };
              next.set(data.symbol, {
                ...existing,
                previousPrice: existing.lastPrice,
                lastPrice: data.price,
                lastTradeSize: data.size,
                lastTradeTime: data.timestamp,
              });
              return next;
            });
            break;

          case "quote":
            setStocks((prev) => {
              const next = new Map(prev);
              const existing = next.get(data.symbol) || {
                symbol: data.symbol,
                ...INITIAL_STOCK_DATA,
              };
              next.set(data.symbol, {
                ...existing,
                bidPrice: data.bidPrice,
                bidSize: data.bidSize,
                askPrice: data.askPrice,
                askSize: data.askSize,
                lastQuoteTime: data.timestamp,
              });
              return next;
            });
            break;
        }
      } catch (err) {
        console.error("[useStockStream] Failed to parse SSE event:", err);
      }
    };

    es.onerror = () => {
      setStatus("error");
      es.close();
      eventSourceRef.current = null;

      const attempt = reconnectAttemptRef.current;
      const delay = Math.min(1000 * 2 ** attempt, 30_000);
      console.log(
        `[useStockStream] Reconnecting in ${delay}ms (attempt ${attempt + 1})`
      );

      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectAttemptRef.current += 1;
        connect();
      }, delay);
    };
  }, [symbolsKey]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect]);

  return { stocks, status, statusMessage, subscribedSymbols, error };
}
