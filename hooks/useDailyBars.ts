"use client";

import { useState, useEffect } from "react";
import type { DailyBar } from "@/app/types/algorithm";

interface UseDailyBarsReturn {
  bars: DailyBar[];
  isLoading: boolean;
  error: string | null;
}

export function useDailyBars(
  symbol: string,
  limit: number = 120
): UseDailyBarsReturn {
  const [bars, setBars] = useState<DailyBar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetch(`/api/stocks/bars?symbol=${symbol}&limit=${limit}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: DailyBar[]) => {
        setBars(data);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [symbol, limit]);

  return { bars, isLoading, error };
}
