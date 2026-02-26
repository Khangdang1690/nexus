import { NextRequest } from "next/server";
import { getSnapshots, upsertTrade, upsertQuote } from "@/lib/db";
import type { StockData } from "@/app/types/stock";
import type { StockCacheRow } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rowToStockData(row: StockCacheRow): StockData {
  return {
    symbol: row.symbol,
    lastPrice: row.last_price,
    previousPrice: row.previous_price,
    lastTradeSize: row.last_trade_size,
    lastTradeTime: row.last_trade_time,
    bidPrice: row.bid_price,
    bidSize: row.bid_size,
    askPrice: row.ask_price,
    askSize: row.ask_size,
    lastQuoteTime: row.last_quote_time,
  };
}

function isCacheStale(updatedAt: string): boolean {
  const updated = new Date(updatedAt + "Z");
  const now = new Date();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  return updated < todayStart;
}

async function fetchAlpacaSnapshots(
  symbols: string[]
): Promise<Map<string, StockData>> {
  const apiKey = process.env.ALPACA_API_KEY;
  const secretKey = process.env.ALPACA_SECRET_KEY;
  if (!apiKey || !secretKey) return new Map();

  try {
    const url = `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbols.join(",")}`;
    const res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": apiKey,
        "APCA-API-SECRET-KEY": secretKey,
      },
    });

    if (!res.ok) {
      console.error("[Snapshot] Alpaca REST error:", res.status, await res.text());
      return new Map();
    }

    const data = await res.json();
    const result = new Map<string, StockData>();

    for (const [symbol, snapshot] of Object.entries(data)) {
      const snap = snapshot as {
        latestTrade?: { p: number; s: number; t: string };
        latestQuote?: {
          bp: number;
          bs: number;
          ap: number;
          as: number;
          t: string;
        };
      };

      const stockData: StockData = {
        symbol,
        lastPrice: snap.latestTrade?.p ?? null,
        previousPrice: null,
        lastTradeSize: snap.latestTrade?.s ?? null,
        lastTradeTime: snap.latestTrade?.t ?? null,
        bidPrice: snap.latestQuote?.bp ?? null,
        bidSize: snap.latestQuote?.bs ?? null,
        askPrice: snap.latestQuote?.ap ?? null,
        askSize: snap.latestQuote?.as ?? null,
        lastQuoteTime: snap.latestQuote?.t ?? null,
      };

      result.set(symbol, stockData);

      // Write fresh data back to cache
      if (snap.latestTrade) {
        try {
          upsertTrade(symbol, snap.latestTrade.p, snap.latestTrade.s, snap.latestTrade.t);
        } catch { /* ignore */ }
      }
      if (snap.latestQuote) {
        try {
          upsertQuote(
            symbol,
            snap.latestQuote.bp,
            snap.latestQuote.bs,
            snap.latestQuote.ap,
            snap.latestQuote.as,
            snap.latestQuote.t
          );
        } catch { /* ignore */ }
      }
    }

    return result;
  } catch (err) {
    console.error("[Snapshot] Failed to fetch from Alpaca REST:", err);
    return new Map();
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const symbolsParam = request.nextUrl.searchParams.get("symbols");

  if (!symbolsParam) {
    return Response.json(
      { error: "Missing 'symbols' query parameter" },
      { status: 400 }
    );
  }

  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{1,5}$/.test(s));

  if (symbols.length === 0) {
    return Response.json(
      { error: "No valid symbols provided" },
      { status: 400 }
    );
  }

  // Step 1: Read from SQLite cache
  let rows: StockCacheRow[];
  try {
    rows = getSnapshots(symbols);
  } catch (err) {
    console.error("[Snapshot] DB read failed:", err);
    rows = [];
  }

  const cachedMap = new Map(rows.map((r) => [r.symbol, r]));

  // Step 2: Determine stale/missing symbols
  const staleSymbols: string[] = [];
  const result: StockData[] = [];

  for (const symbol of symbols) {
    const cached = cachedMap.get(symbol);
    if (!cached || isCacheStale(cached.updated_at)) {
      staleSymbols.push(symbol);
    } else {
      result.push(rowToStockData(cached));
    }
  }

  // Step 3: Fetch fresh data for stale/missing symbols
  if (staleSymbols.length > 0) {
    const fresh = await fetchAlpacaSnapshots(staleSymbols);
    for (const symbol of staleSymbols) {
      const freshData = fresh.get(symbol);
      if (freshData) {
        result.push(freshData);
      }
    }
  }

  return Response.json(result);
}
