"use client";

import { useDailyBars } from "@/hooks/useDailyBars";
import { StockChart } from "@/components/StockChart";
import type { StockData } from "@/app/types/stock";

interface StockChartWrapperProps {
  symbol: string;
  stockData: StockData;
}

export function StockChartWrapper({ symbol, stockData }: StockChartWrapperProps) {
  const { bars, isLoading } = useDailyBars(symbol);

  return (
    <StockChart
      symbol={symbol}
      stockData={stockData}
      bars={bars}
      isLoadingBars={isLoading}
    />
  );
}
