import { NextRequest } from "next/server";
import WebSocket from "ws";
import type { AlpacaTrade, AlpacaQuote, SSEEvent } from "@/app/types/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALPACA_WS_URL = "wss://stream.data.alpaca.markets/v2/iex";

export async function GET(request: NextRequest): Promise<Response> {
  const symbolsParam = request.nextUrl.searchParams.get("symbols");

  if (!symbolsParam) {
    return Response.json(
      { error: "Missing 'symbols' query parameter. Example: ?symbols=AAPL,GOOGL" },
      { status: 400 }
    );
  }

  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{1,5}$/.test(s));

  if (symbols.length === 0) {
    return Response.json(
      { error: "No valid symbols provided. Use 1-5 letter tickers." },
      { status: 400 }
    );
  }

  const apiKey = process.env.ALPACA_API_KEY;
  const secretKey = process.env.ALPACA_SECRET_KEY;

  if (!apiKey || !secretKey || apiKey === "your_api_key_here") {
    return Response.json(
      { error: "Alpaca API keys not configured. Set ALPACA_API_KEY and ALPACA_SECRET_KEY in .env.local" },
      { status: 500 }
    );
  }

  const encoder = new TextEncoder();
  let ws: WebSocket | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: SSEEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Controller may be closed
        }
      };

      const sendKeepAlive = () => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // Ignore if closed
        }
      };

      const keepAliveInterval = setInterval(sendKeepAlive, 15_000);

      ws = new WebSocket(ALPACA_WS_URL);

      ws.on("open", () => {
        sendEvent({
          type: "status",
          status: "connected",
          message: "Connected to Alpaca stream",
        });

        ws!.send(
          JSON.stringify({
            action: "auth",
            key: apiKey,
            secret: secretKey,
          })
        );
      });

      ws.on("message", (raw: WebSocket.RawData) => {
        try {
          const messages = JSON.parse(raw.toString());
          if (!Array.isArray(messages)) return;

          for (const msg of messages) {
            switch (msg.T) {
              case "success":
                if (msg.msg === "authenticated") {
                  sendEvent({
                    type: "status",
                    status: "authenticated",
                    message: "Authenticated with Alpaca",
                  });
                  ws!.send(
                    JSON.stringify({
                      action: "subscribe",
                      trades: symbols,
                      quotes: symbols,
                    })
                  );
                }
                break;

              case "subscription":
                sendEvent({
                  type: "status",
                  status: "subscribed",
                  message: `Subscribed to ${symbols.join(", ")}`,
                  subscribedSymbols: symbols,
                });
                break;

              case "t": {
                const trade = msg as AlpacaTrade;
                sendEvent({
                  type: "trade",
                  symbol: trade.S,
                  price: trade.p,
                  size: trade.s,
                  timestamp: trade.t,
                  conditions: trade.c || [],
                });
                break;
              }

              case "q": {
                const quote = msg as AlpacaQuote;
                sendEvent({
                  type: "quote",
                  symbol: quote.S,
                  bidPrice: quote.bp,
                  bidSize: quote.bs,
                  askPrice: quote.ap,
                  askSize: quote.as,
                  timestamp: quote.t,
                });
                break;
              }

              case "error":
                sendEvent({
                  type: "status",
                  status: "error",
                  message: `Alpaca error: ${msg.msg} (code: ${msg.code})`,
                });
                break;
            }
          }
        } catch (err) {
          console.error("[Alpaca WS] Failed to parse message:", err);
        }
      });

      ws.on("error", (err) => {
        console.error("[Alpaca WS] Error:", err.message);
        sendEvent({
          type: "status",
          status: "error",
          message: `WebSocket error: ${err.message}`,
        });
      });

      ws.on("close", (code, reason) => {
        console.log(`[Alpaca WS] Closed: ${code} ${reason.toString()}`);
        sendEvent({
          type: "status",
          status: "disconnected",
          message: `Alpaca connection closed (${code})`,
        });
        clearInterval(keepAliveInterval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });

      request.signal.addEventListener("abort", () => {
        console.log("[SSE] Client disconnected, closing Alpaca WebSocket");
        clearInterval(keepAliveInterval);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        ws = null;
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },

    cancel() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
