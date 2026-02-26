import { triggerManualRebalance } from "@/lib/algorithm/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    const result = await triggerManualRebalance();
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
