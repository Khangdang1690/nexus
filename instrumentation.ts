export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeAlgorithm } = await import("@/lib/algorithm/engine");
    try {
      await initializeAlgorithm();
      console.log("[Algorithm] Scheduler initialized");
    } catch (err) {
      console.error("[Algorithm] Failed to initialize:", err);
    }
  }
}
