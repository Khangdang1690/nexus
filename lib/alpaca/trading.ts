import type {
  AlpacaAccount,
  AlpacaPosition,
  AlpacaClock,
  OrderRecord,
} from "@/app/types/algorithm";

const TRADING_BASE_URL = "https://paper-api.alpaca.markets";

function getHeaders(): Record<string, string> {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY!,
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY!,
    "Content-Type": "application/json",
  };
}

export async function getAccount(): Promise<AlpacaAccount> {
  const res = await fetch(`${TRADING_BASE_URL}/v2/account`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Account fetch failed: ${res.status}`);
  const data = await res.json();
  return {
    id: data.id,
    equity: parseFloat(data.equity),
    cash: parseFloat(data.cash),
    buyingPower: parseFloat(data.buying_power),
    portfolioValue: parseFloat(data.portfolio_value),
    status: data.status,
  };
}

export async function getPositions(): Promise<AlpacaPosition[]> {
  const res = await fetch(`${TRADING_BASE_URL}/v2/positions`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Positions fetch failed: ${res.status}`);
  const data = await res.json();
  return (data as Record<string, string>[]).map((p) => ({
    symbol: p.symbol,
    qty: parseFloat(p.qty),
    side: p.side,
    marketValue: parseFloat(p.market_value),
    costBasis: parseFloat(p.cost_basis),
    unrealizedPl: parseFloat(p.unrealized_pl),
    unrealizedPlpc: parseFloat(p.unrealized_plpc),
    currentPrice: parseFloat(p.current_price),
  }));
}

export async function getClock(): Promise<AlpacaClock> {
  const res = await fetch(`${TRADING_BASE_URL}/v2/clock`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Clock fetch failed: ${res.status}`);
  const data = await res.json();
  return {
    timestamp: data.timestamp,
    isOpen: data.is_open,
    nextOpen: data.next_open,
    nextClose: data.next_close,
  };
}

export async function submitMarketOrder(
  symbol: string,
  qty: number,
  side: "buy" | "sell"
): Promise<OrderRecord> {
  const res = await fetch(`${TRADING_BASE_URL}/v2/orders`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      symbol,
      qty: String(qty),
      side,
      type: "market",
      time_in_force: "day",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[Trading] Order failed for ${symbol}:`, res.status, text);
    return {
      symbol,
      side,
      qty,
      type: "market",
      status: `error: ${res.status}`,
    };
  }

  const data = await res.json();
  return {
    symbol,
    side,
    qty,
    type: "market",
    status: data.status,
  };
}

export async function closePosition(symbol: string): Promise<void> {
  const res = await fetch(
    `${TRADING_BASE_URL}/v2/positions/${encodeURIComponent(symbol)}`,
    { method: "DELETE", headers: getHeaders() }
  );
  if (!res.ok && res.status !== 404) {
    console.error(`[Trading] Close position failed for ${symbol}:`, res.status);
  }
}
