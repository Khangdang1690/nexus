import { getAlgorithmState } from "@/lib/algorithm/engine";
import { getAccount, getPositions } from "@/lib/alpaca/trading";
import { getRebalanceLogs } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const state = getAlgorithmState();

  let account = null;
  let positions: Awaited<ReturnType<typeof getPositions>> = [];

  try {
    [account, positions] = await Promise.all([
      getAccount(),
      getPositions(),
    ]);
  } catch (err) {
    console.error("[Algorithm API] Failed to fetch account/positions:", err);
  }

  let rebalanceHistory: ReturnType<typeof getRebalanceLogs> = [];
  try {
    rebalanceHistory = getRebalanceLogs(10);
  } catch {
    rebalanceHistory = [];
  }

  return Response.json({
    state,
    account,
    positions,
    rebalanceHistory,
  });
}
