import type { DailyBar } from "@/app/types/algorithm";

const DATA_BASE_URL = "https://data.alpaca.markets";

function getHeaders(): Record<string, string> {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY!,
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY!,
  };
}

export async function fetchDailyBars(
  symbols: string[],
  startDate: string,
  endDate?: string
): Promise<Map<string, DailyBar[]>> {
  const result = new Map<string, DailyBar[]>();
  if (symbols.length === 0) return result;

  // Initialize empty arrays for each symbol
  for (const s of symbols) result.set(s, []);

  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      symbols: symbols.join(","),
      timeframe: "1Day",
      start: startDate,
      adjustment: "split",
      limit: "10000",
      sort: "asc",
    });
    if (endDate) params.set("end", endDate);
    if (pageToken) params.set("page_token", pageToken);

    const res = await fetch(
      `${DATA_BASE_URL}/v2/stocks/bars?${params.toString()}`,
      { headers: getHeaders() }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[Alpaca Data] bars error:", res.status, text);
      break;
    }

    const data = await res.json();

    // data.bars is keyed by symbol: { "AAPL": [...], "GOOGL": [...] }
    if (data.bars) {
      for (const [symbol, bars] of Object.entries(data.bars)) {
        const existing = result.get(symbol) ?? [];
        for (const bar of bars as {
          t: string;
          o: number;
          h: number;
          l: number;
          c: number;
          v: number;
        }[]) {
          existing.push({
            symbol,
            date: bar.t.substring(0, 10), // "2025-01-15T05:00:00Z" → "2025-01-15"
            open: bar.o,
            high: bar.h,
            low: bar.l,
            close: bar.c,
            volume: bar.v,
          });
        }
        result.set(symbol, existing);
      }
    }

    pageToken = data.next_page_token ?? undefined;
  } while (pageToken);

  return result;
}
