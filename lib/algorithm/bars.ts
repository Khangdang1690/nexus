import type { DailyBar } from "@/app/types/algorithm";
import { WARMUP_BARS } from "@/app/types/algorithm";
import { fetchDailyBars } from "@/lib/alpaca/data";
import {
  upsertDailyBars,
  getDailyBars,
  getLatestBarDates,
} from "@/lib/db";

/**
 * Compute a start date string ~18 months ago (enough for 300 trading days).
 */
function getWarmupStartDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 18);
  return d.toISOString().substring(0, 10);
}

/**
 * Get the next calendar day after a date string.
 */
function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().substring(0, 10);
}

/**
 * Ensure bars are loaded for all symbols.
 * Fetches from Alpaca for any symbols missing or with stale data,
 * then caches in SQLite.
 */
export async function ensureBarsLoaded(
  symbols: string[]
): Promise<void> {
  const latestDates = getLatestBarDates(symbols);
  const today = new Date().toISOString().substring(0, 10);

  // Determine which symbols need fetching and from when
  const toFetch: string[] = [];
  let earliestStart = today;

  for (const symbol of symbols) {
    const latest = latestDates.get(symbol);
    if (!latest) {
      // No bars at all — need full warmup
      toFetch.push(symbol);
      const warmupStart = getWarmupStartDate();
      if (warmupStart < earliestStart) earliestStart = warmupStart;
    } else if (latest < today) {
      // Have some bars but potentially stale
      toFetch.push(symbol);
      const start = nextDay(latest);
      if (start < earliestStart) earliestStart = start;
    }
  }

  if (toFetch.length === 0) return;

  console.log(
    `[Algorithm] Fetching bars for ${toFetch.length} symbols from ${earliestStart}`
  );

  // For symbols that have no bars at all, we need a longer lookback
  const symbolsNeedingFullWarmup = toFetch.filter(
    (s) => !latestDates.has(s)
  );
  const symbolsNeedingUpdate = toFetch.filter((s) => latestDates.has(s));

  // Fetch full warmup for new symbols
  if (symbolsNeedingFullWarmup.length > 0) {
    const bars = await fetchDailyBars(
      symbolsNeedingFullWarmup,
      getWarmupStartDate()
    );
    const allBars: DailyBar[] = [];
    for (const barList of bars.values()) {
      allBars.push(...barList);
    }
    if (allBars.length > 0) {
      upsertDailyBars(allBars);
      console.log(
        `[Algorithm] Cached ${allBars.length} bars for ${symbolsNeedingFullWarmup.length} new symbols`
      );
    }
  }

  // Fetch incremental updates for existing symbols
  if (symbolsNeedingUpdate.length > 0) {
    // Find the earliest "next day" among stale symbols
    let updateStart = today;
    for (const s of symbolsNeedingUpdate) {
      const nd = nextDay(latestDates.get(s)!);
      if (nd < updateStart) updateStart = nd;
    }

    const bars = await fetchDailyBars(symbolsNeedingUpdate, updateStart);
    const allBars: DailyBar[] = [];
    for (const barList of bars.values()) {
      allBars.push(...barList);
    }
    if (allBars.length > 0) {
      upsertDailyBars(allBars);
      console.log(
        `[Algorithm] Updated ${allBars.length} bars for ${symbolsNeedingUpdate.length} symbols`
      );
    }
  }
}

/**
 * Refresh bars for all symbols (fetch latest data from Alpaca).
 */
export async function refreshBars(symbols: string[]): Promise<void> {
  await ensureBarsLoaded(symbols);
}

/**
 * Get bar history for a symbol from SQLite cache.
 * Returns bars sorted by date ascending (oldest first).
 */
export function getBarHistory(
  symbol: string,
  count: number = WARMUP_BARS
): DailyBar[] {
  // getDailyBars returns DESC, we reverse to ASC
  return getDailyBars(symbol, count).reverse();
}
