import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type {
  DailyBar,
  AlgorithmState,
  RebalanceResult,
} from "@/app/types/algorithm";

export interface StockCacheRow {
  symbol: string;
  last_price: number | null;
  previous_price: number | null;
  last_trade_size: number | null;
  last_trade_time: string | null;
  bid_price: number | null;
  bid_size: number | null;
  ask_price: number | null;
  ask_size: number | null;
  last_quote_time: string | null;
  updated_at: string;
}

// Singleton: survive Next.js hot reloads in dev
const globalForDb = globalThis as typeof globalThis & {
  __stocksDb?: Database.Database;
};

function getDb(): Database.Database {
  if (globalForDb.__stocksDb) return globalForDb.__stocksDb;

  const dbPath = path.join(process.cwd(), "data", "stocks.db");
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_cache (
      symbol          TEXT PRIMARY KEY,
      last_price      REAL,
      previous_price  REAL,
      last_trade_size INTEGER,
      last_trade_time TEXT,
      bid_price       REAL,
      bid_size        INTEGER,
      ask_price       REAL,
      ask_size        INTEGER,
      last_quote_time TEXT,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_bars (
      symbol  TEXT NOT NULL,
      date    TEXT NOT NULL,
      open    REAL NOT NULL,
      high    REAL NOT NULL,
      low     REAL NOT NULL,
      close   REAL NOT NULL,
      volume  INTEGER NOT NULL,
      PRIMARY KEY (symbol, date)
    );

    CREATE TABLE IF NOT EXISTS algorithm_state (
      id               TEXT PRIMARY KEY DEFAULT 'current',
      last_rebalance   TEXT,
      next_rebalance   TEXT,
      current_targets  TEXT,
      latest_scores    TEXT,
      spy_regime       TEXT,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rebalance_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp       TEXT NOT NULL,
      trigger_type    TEXT NOT NULL,
      spy_regime      TEXT,
      scores          TEXT,
      targets         TEXT,
      orders          TEXT,
      account_equity  REAL,
      success         INTEGER NOT NULL DEFAULT 0,
      error           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  globalForDb.__stocksDb = db;
  return db;
}

// Prepared statements (lazy-initialized, tied to DB instance)
let _upsertTrade: Database.Statement | null = null;
let _upsertQuote: Database.Statement | null = null;

function getUpsertTradeStmt(): Database.Statement {
  if (!_upsertTrade) {
    _upsertTrade = getDb().prepare(`
      INSERT INTO stock_cache (symbol, last_price, last_trade_size, last_trade_time, updated_at)
      VALUES (@symbol, @lastPrice, @lastTradeSize, @lastTradeTime, datetime('now'))
      ON CONFLICT(symbol) DO UPDATE SET
        previous_price = stock_cache.last_price,
        last_price = @lastPrice,
        last_trade_size = @lastTradeSize,
        last_trade_time = @lastTradeTime,
        updated_at = datetime('now')
    `);
  }
  return _upsertTrade;
}

function getUpsertQuoteStmt(): Database.Statement {
  if (!_upsertQuote) {
    _upsertQuote = getDb().prepare(`
      INSERT INTO stock_cache (symbol, bid_price, bid_size, ask_price, ask_size, last_quote_time, updated_at)
      VALUES (@symbol, @bidPrice, @bidSize, @askPrice, @askSize, @lastQuoteTime, datetime('now'))
      ON CONFLICT(symbol) DO UPDATE SET
        bid_price = @bidPrice,
        bid_size = @bidSize,
        ask_price = @askPrice,
        ask_size = @askSize,
        last_quote_time = @lastQuoteTime,
        updated_at = datetime('now')
    `);
  }
  return _upsertQuote;
}

export function upsertTrade(
  symbol: string,
  price: number,
  size: number,
  timestamp: string
): void {
  getUpsertTradeStmt().run({
    symbol,
    lastPrice: price,
    lastTradeSize: size,
    lastTradeTime: timestamp,
  });
}

export function upsertQuote(
  symbol: string,
  bidPrice: number,
  bidSize: number,
  askPrice: number,
  askSize: number,
  timestamp: string
): void {
  getUpsertQuoteStmt().run({
    symbol,
    bidPrice,
    bidSize,
    askPrice,
    askSize,
    lastQuoteTime: timestamp,
  });
}

export function getSnapshots(symbols: string[]): StockCacheRow[] {
  if (symbols.length === 0) return [];
  const db = getDb();
  const placeholders = symbols.map(() => "?").join(",");
  const stmt = db.prepare(
    `SELECT * FROM stock_cache WHERE symbol IN (${placeholders})`
  );
  return stmt.all(...symbols) as StockCacheRow[];
}

// ─── Daily Bars ──────────────────────────────────────────────

export function upsertDailyBars(bars: DailyBar[]): void {
  if (bars.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO daily_bars (symbol, date, open, high, low, close, volume)
    VALUES (@symbol, @date, @open, @high, @low, @close, @volume)
    ON CONFLICT(symbol, date) DO UPDATE SET
      open = @open, high = @high, low = @low, close = @close, volume = @volume
  `);
  const insertMany = db.transaction((rows: DailyBar[]) => {
    for (const row of rows) stmt.run(row);
  });
  insertMany(bars);
}

export function getDailyBars(symbol: string, limit: number): DailyBar[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT symbol, date, open, high, low, close, volume
       FROM daily_bars WHERE symbol = ? ORDER BY date DESC LIMIT ?`
    )
    .all(symbol, limit) as DailyBar[];
}

export function getLatestBarDates(
  symbols: string[]
): Map<string, string> {
  if (symbols.length === 0) return new Map();
  const db = getDb();
  const placeholders = symbols.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT symbol, MAX(date) as latest_date
       FROM daily_bars WHERE symbol IN (${placeholders}) GROUP BY symbol`
    )
    .all(...symbols) as { symbol: string; latest_date: string }[];
  return new Map(rows.map((r) => [r.symbol, r.latest_date]));
}

// ─── Algorithm State ─────────────────────────────────────────

export function saveAlgorithmState(state: {
  lastRebalance?: string | null;
  nextRebalance?: string | null;
  currentTargets?: unknown[];
  latestScores?: unknown[];
  spyRegime?: unknown;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO algorithm_state (id, last_rebalance, next_rebalance, current_targets, latest_scores, spy_regime, updated_at)
     VALUES ('current', @lastRebalance, @nextRebalance, @currentTargets, @latestScores, @spyRegime, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       last_rebalance = COALESCE(@lastRebalance, algorithm_state.last_rebalance),
       next_rebalance = COALESCE(@nextRebalance, algorithm_state.next_rebalance),
       current_targets = COALESCE(@currentTargets, algorithm_state.current_targets),
       latest_scores = COALESCE(@latestScores, algorithm_state.latest_scores),
       spy_regime = COALESCE(@spyRegime, algorithm_state.spy_regime),
       updated_at = datetime('now')`
  ).run({
    lastRebalance: state.lastRebalance ?? null,
    nextRebalance: state.nextRebalance ?? null,
    currentTargets: state.currentTargets
      ? JSON.stringify(state.currentTargets)
      : null,
    latestScores: state.latestScores
      ? JSON.stringify(state.latestScores)
      : null,
    spyRegime: state.spyRegime ? JSON.stringify(state.spyRegime) : null,
  });
}

export function loadAlgorithmState(): AlgorithmState | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM algorithm_state WHERE id = 'current'`)
    .get() as {
    last_rebalance: string | null;
    next_rebalance: string | null;
    current_targets: string | null;
    latest_scores: string | null;
    spy_regime: string | null;
  } | undefined;

  if (!row) return null;

  return {
    lastRebalance: row.last_rebalance,
    nextScheduledRebalance: row.next_rebalance,
    currentTargets: row.current_targets
      ? JSON.parse(row.current_targets)
      : [],
    latestScores: row.latest_scores ? JSON.parse(row.latest_scores) : [],
    spyRegime: row.spy_regime ? JSON.parse(row.spy_regime) : null,
    isRunning: false,
    schedulerActive: false,
  };
}

// ─── Rebalance Log ───────────────────────────────────────────

export function insertRebalanceLog(result: RebalanceResult): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO rebalance_log (timestamp, trigger_type, spy_regime, scores, targets, orders, account_equity, success, error)
     VALUES (@timestamp, @triggerType, @spyRegime, @scores, @targets, @orders, @accountEquity, @success, @error)`
  ).run({
    timestamp: result.timestamp,
    triggerType: result.triggerType,
    spyRegime: JSON.stringify(result.spyRegime),
    scores: JSON.stringify(result.scores),
    targets: JSON.stringify(result.targets),
    orders: JSON.stringify(result.ordersPlaced),
    accountEquity: result.accountEquity,
    success: result.success ? 1 : 0,
    error: result.error ?? null,
  });
}

export function getRebalanceLogs(limit: number): RebalanceResult[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM rebalance_log ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as {
    timestamp: string;
    trigger_type: string;
    spy_regime: string;
    scores: string;
    targets: string;
    orders: string;
    account_equity: number;
    success: number;
    error: string | null;
  }[];

  return rows.map((r) => ({
    timestamp: r.timestamp,
    triggerType: r.trigger_type as "scheduled" | "manual",
    spyRegime: JSON.parse(r.spy_regime),
    scores: JSON.parse(r.scores),
    targets: JSON.parse(r.targets),
    ordersPlaced: JSON.parse(r.orders),
    accountEquity: r.account_equity,
    success: r.success === 1,
    error: r.error ?? undefined,
  }));
}
