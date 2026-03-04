"use client";

import { useRef, useEffect } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
} from "lightweight-charts";
import type { StockData } from "@/app/types/stock";
import type { DailyBar } from "@/app/types/algorithm";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface StockChartProps {
  symbol: string;
  stockData: StockData;
  bars: DailyBar[];
  isLoadingBars: boolean;
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

export function StockChart({
  symbol,
  stockData,
  bars,
  isLoadingBars,
}: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const currentDayBarRef = useRef<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  // Create chart and set historical data
  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.1)",
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.1)",
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const candleData: CandlestickData<Time>[] = bars.map((b) => ({
      time: b.date as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));

    const volumeData: HistogramData<Time>[] = bars.map((b) => ({
      time: b.date as Time,
      value: b.volume,
      color: b.close >= b.open ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)",
    }));

    candleSeries.setData(candleData);
    volumeSeries.setData(volumeData);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    currentDayBarRef.current = null;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [bars]);

  // Update last candle with real-time ticks
  useEffect(() => {
    const series = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!series || !volumeSeries || stockData.lastPrice === null) return;

    const today = new Date().toISOString().substring(0, 10);
    const price = stockData.lastPrice;
    const size = stockData.lastTradeSize ?? 0;

    const current = currentDayBarRef.current;
    if (!current || current.date !== today) {
      currentDayBarRef.current = {
        date: today,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: size,
      };
    } else {
      current.high = Math.max(current.high, price);
      current.low = Math.min(current.low, price);
      current.close = price;
      current.volume += size;
    }

    const bar = currentDayBarRef.current!;
    series.update({
      time: bar.date as Time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    });
    volumeSeries.update({
      time: bar.date as Time,
      value: bar.volume,
      color:
        bar.close >= bar.open
          ? "rgba(16,185,129,0.3)"
          : "rgba(239,68,68,0.3)",
    });
  }, [stockData.lastPrice, stockData.lastTradeTime]);

  const { lastPrice, previousPrice, lastTradeSize, lastTradeTime, lastQuoteTime } =
    stockData;

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

  const hasData = lastPrice !== null;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold">{symbol}</span>
            {hasData && (
              <span className={`text-xl font-semibold tabular-nums ${priceColorClass}`}>
                ${lastPrice.toFixed(2)}{" "}
                <span className="text-sm">{priceArrow}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {lastTradeSize !== null && (
              <span>Last: {lastTradeSize.toLocaleString()} shares</span>
            )}
            <span>{formatTime(lastTradeTime || lastQuoteTime)}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        {isLoadingBars ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Loading chart data...
          </div>
        ) : bars.length === 0 && !hasData ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Waiting for market data...
          </div>
        ) : (
          <div ref={containerRef} className="h-[300px] w-full" />
        )}
      </CardContent>
    </Card>
  );
}
