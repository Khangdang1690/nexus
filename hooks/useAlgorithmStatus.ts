"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  AlgorithmState,
  AlpacaAccount,
  AlpacaPosition,
  RebalanceResult,
} from "@/app/types/algorithm";

interface AlgorithmStatusReturn {
  state: AlgorithmState | null;
  account: AlpacaAccount | null;
  positions: AlpacaPosition[];
  rebalanceHistory: RebalanceResult[];
  isLoading: boolean;
  error: string | null;
  triggerRebalance: () => Promise<RebalanceResult | null>;
  isRebalancing: boolean;
  refresh: () => void;
}

export function useAlgorithmStatus(): AlgorithmStatusReturn {
  const [state, setState] = useState<AlgorithmState | null>(null);
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [positions, setPositions] = useState<AlpacaPosition[]>([]);
  const [rebalanceHistory, setRebalanceHistory] = useState<RebalanceResult[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRebalancing, setIsRebalancing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/algorithm/status");
      if (!res.ok) throw new Error(`Status fetch failed: ${res.status}`);
      const data = await res.json();
      setState(data.state);
      setAccount(data.account);
      setPositions(data.positions ?? []);
      setRebalanceHistory(data.rebalanceHistory ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const triggerRebalance = useCallback(async (): Promise<RebalanceResult | null> => {
    setIsRebalancing(true);
    try {
      const res = await fetch("/api/algorithm/rebalance", { method: "POST" });
      const data = await res.json();
      // Refresh status after rebalance
      await fetchStatus();
      return data;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Rebalance request failed"
      );
      return null;
    } finally {
      setIsRebalancing(false);
    }
  }, [fetchStatus]);

  return {
    state,
    account,
    positions,
    rebalanceHistory,
    isLoading,
    error,
    triggerRebalance,
    isRebalancing,
    refresh: fetchStatus,
  };
}
