import { NextRequest } from "next/server";
import { getDailyBars, getLatestBarDates, upsertDailyBars } from "@/lib/db";
import { fetchDailyBars } from "@/lib/alpaca/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getWarmupStartDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().substring(0, 10);
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().substring(0, 10);
}

export async function GET(request: NextRequest): Promise<Response> {
  const symbol = request.nextUrl.searchParams.get("symbol")?.toUpperCase();
  const limit = parseInt(
    request.nextUrl.searchParams.get("limit") || "120",
    10
  );

  if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) {
    return Response.json({ error: "Invalid symbol" }, { status: 400 });
  }

  try {
    const latestDates = getLatestBarDates([symbol]);
    const today = new Date().toISOString().substring(0, 10);
    const latestCached = latestDates.get(symbol);

    if (!latestCached) {
      // No bars at all — fetch ~6 months
      const barsMap = await fetchDailyBars([symbol], getWarmupStartDate());
      const bars = barsMap.get(symbol) || [];
      if (bars.length > 0) upsertDailyBars(bars);
    } else if (latestCached < today) {
      // Stale — incremental fetch
      const barsMap = await fetchDailyBars([symbol], nextDay(latestCached));
      const bars = barsMap.get(symbol) || [];
      if (bars.length > 0) upsertDailyBars(bars);
    }

    // getDailyBars returns DESC, reverse to ASC
    const bars = getDailyBars(symbol, limit).reverse();
    return Response.json(bars);
  } catch (err) {
    console.error("[Bars API] Error:", err);
    // Still try to return cached data even if Alpaca fetch failed
    try {
      const bars = getDailyBars(symbol, limit).reverse();
      return Response.json(bars);
    } catch {
      return Response.json([], { status: 200 });
    }
  }
}
