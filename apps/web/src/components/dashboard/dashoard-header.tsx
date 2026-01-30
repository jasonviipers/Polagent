"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { DynamicBreadcrumb } from "./dynamic-breadcrumb";

export function DashboardHeader() {
  const [currentTime, setCurrentTime] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const updateTime = () => {
    const now = new Date();
    setCurrentTime(
      now.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    );
  };

  useEffect(() => {
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <header className="flex flex-wrap items-center gap-3 border-b p-3 transition-all ease-linear">
      <div className="flex flex-1 items-center gap-2">
        <SidebarTrigger className="rounded-full" />
        <div className="max-lg:hidden lg:contents">
          <Separator
            className="me-2 data-[orientation=vertical]:h-4"
            orientation="vertical"
          />
          <DynamicBreadcrumb />
        </div>
      </div>
      {/* <NotificationBell/> */}
      {/* <ModeToggle /> */}
      {/* Last Update Time */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">LAST UPDATE</span>
        <span className="font-medium font-mono text-foreground text-sm">
          {currentTime}
        </span>
      </div>
      {/* Refresh Button */}
      <Button
        className="h-8 w-8"
        onClick={handleRefresh}
        size="icon"
        variant="ghost"
      >
        <RefreshCw
          className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
        />
        <span className="sr-only">Refresh</span>
      </Button>
    </header>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  className?: string;
}

export function PageHeader({
  title,
  description,
  className = "",
}: PageHeaderProps) {
  return (
    <div className={`mb-8 ${className}`}>
      <h1 className="font-bold text-2xl tracking-tight">{title}</h1>
      {description && <p className="text-muted-foreground">{description}</p>}
    </div>
  );
}
