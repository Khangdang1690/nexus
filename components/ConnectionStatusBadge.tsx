"use client";

import type { ConnectionStatus } from "@/app/types/stock";
import { Badge } from "@/components/ui/badge";

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
  message: string;
}

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; dotClass: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  connecting: {
    label: "Connecting",
    dotClass: "bg-yellow-400 animate-pulse",
    variant: "outline",
  },
  connected: {
    label: "Live",
    dotClass: "bg-emerald-500 animate-pulse",
    variant: "secondary",
  },
  disconnected: {
    label: "Disconnected",
    dotClass: "bg-muted-foreground",
    variant: "outline",
  },
  error: {
    label: "Error",
    dotClass: "bg-red-500",
    variant: "destructive",
  },
};

export function ConnectionStatusBadge({
  status,
  message,
}: ConnectionStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-2">
      <Badge variant={config.variant} className="gap-1.5">
        <span className={`inline-block h-2 w-2 rounded-full ${config.dotClass}`} />
        {config.label}
      </Badge>
      {message && (
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {message}
        </span>
      )}
    </div>
  );
}
