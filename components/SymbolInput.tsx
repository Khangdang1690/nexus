"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface SymbolInputProps {
  onAddSymbol: (symbol: string) => void;
  onRemoveSymbol: (symbol: string) => void;
  activeSymbols: string[];
}

export function SymbolInput({
  onAddSymbol,
  onRemoveSymbol,
  activeSymbols,
}: SymbolInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const symbol = input.trim().toUpperCase();
    if (symbol && /^[A-Z]{1,5}$/.test(symbol) && !activeSymbols.includes(symbol)) {
      onAddSymbol(symbol);
      setInput("");
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="Enter symbol (e.g. AAPL)"
          maxLength={5}
          className="flex-1"
        />
        <Button
          type="submit"
          disabled={
            !input.trim() ||
            activeSymbols.includes(input.trim().toUpperCase())
          }
        >
          Add
        </Button>
      </form>

      {activeSymbols.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeSymbols.map((symbol) => (
            <Badge key={symbol} variant="secondary" className="gap-1 pr-1">
              {symbol}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onRemoveSymbol(symbol)}
                aria-label={`Remove ${symbol}`}
                className="h-4 w-4 rounded-full hover:bg-destructive/20 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
