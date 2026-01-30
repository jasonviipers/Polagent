"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  description: string;
  index: string;
  highlight?: boolean;
  trend?: "up" | "down" | "neutral";
  isLoading?: boolean;
}

function StatCard({
  label,
  value,
  description,
  index,
  highlight,
  trend,
  isLoading,
}: StatCardProps) {
  return (
    <Card className="flex flex-col gap-2 border border-border bg-card p-4 transition-all duration-200 hover:border-[#d4af37]">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <span className="font-mono">{index}</span>
        <span className="uppercase tracking-wider">{label}</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <div
          className={cn(
            "font-bold font-mono text-2xl",
            highlight && "text-primary",
            trend === "up" && "text-[#22c55e]",
            trend === "down" && "text-[#f43f5e]",
            !(highlight || trend) && "text-foreground"
          )}
        >
          {value}
        </div>
      )}
      <div className="text-muted-foreground text-xs">{description}</div>
    </Card>
  );
}

function _formatVolume(volume: number | string | undefined | null): string {
  const num = typeof volume === "string" ? Number.parseFloat(volume) : volume;
  if (num == null || Number.isNaN(num)) {
    return "$0";
  }
  if (num >= 1_000_000_000) {
    return `$${(num / 1_000_000_000).toFixed(2)}B`;
  }
  if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1000) {
    return `$${(num / 1000).toFixed(1)}K`;
  }
  return `$${num.toFixed(0)}`;
}

export function StatsCards() {
  const _stats = useMemo(() => {}, []);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        description="Total positions value"
        highlight
        index="01"
        label="PORTFOLIO VALUE"
        value="$12.4K"
      />
      <StatCard
        description="Profit and loss today"
        index="02"
        label="UNREALIZED P&L"
        trend="up"
        value="+$847.32"
      />
      <StatCard
        description="Active prediction markets"
        index="03"
        label="TRACKED MARKETS"
        value="247"
      />
      <StatCard
        description="Platform trading volume"
        index="04"
        label="24H VOLUME"
        trend="up"
        value="$12.4K"
      />
    </div>
  );
}
