// Raw Alpaca WebSocket message types (server-side)

export interface AlpacaTrade {
  T: "t";
  S: string;
  p: number;
  s: number;
  t: string;
  c: string[];
  i: number;
  x: string;
  z: string;
}

export interface AlpacaQuote {
  T: "q";
  S: string;
  bp: number;
  bs: number;
  ap: number;
  as: number;
  t: string;
  c: string[];
  x: string;
  z: string;
}

// SSE event types sent from server to client

export interface SSETradeEvent {
  type: "trade";
  symbol: string;
  price: number;
  size: number;
  timestamp: string;
  conditions: string[];
}

export interface SSEQuoteEvent {
  type: "quote";
  symbol: string;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  timestamp: string;
}

export interface SSEStatusEvent {
  type: "status";
  status: "connected" | "authenticated" | "subscribed" | "error" | "disconnected";
  message: string;
  subscribedSymbols?: string[];
}

export type SSEEvent = SSETradeEvent | SSEQuoteEvent | SSEStatusEvent;

// Client-side state types

export interface StockData {
  symbol: string;
  lastPrice: number | null;
  previousPrice: number | null;
  lastTradeSize: number | null;
  lastTradeTime: string | null;
  bidPrice: number | null;
  bidSize: number | null;
  askPrice: number | null;
  askSize: number | null;
  lastQuoteTime: string | null;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
