"use client";

import {
  Activity,
  BarChart3,
  Camera,
  ChevronDown,
  Clock,
  Crosshair,
  Layers,
  Maximize2,
  Palette,
  Plus,
  RefreshCw,
  Settings2,
  TrendingUp,
  X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// Types
interface CandleData {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isUp: boolean;
  sma20?: number;
  sma50?: number;
  ema9?: number;
  ema21?: number;
  bollingerUpper?: number;
  bollingerMiddle?: number;
  bollingerLower?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  vwap?: number;
}

type Timeframe = "1m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D" | "1W";
type ChartType = "candle" | "line" | "area" | "bar";

interface IndicatorConfig {
  id: string;
  name: string;
  enabled: boolean;
  color: string;
  lineWidth: number;
  period?: number;
  period2?: number;
  stdDev?: number;
}

interface ChartSettings {
  chartType: ChartType;
  showGrid: boolean;
  gridColor: string;
  backgroundColor: string;
  upColor: string;
  downColor: string;
  wickUpColor: string;
  wickDownColor: string;
  showVolume: boolean;
  volumeOpacity: number;
  showCrosshair: boolean;
  showPriceLabel: boolean;
  autoScale: boolean;
}

const DEFAULT_SETTINGS: ChartSettings = {
  chartType: "candle",
  showGrid: true,
  gridColor: "#262626",
  backgroundColor: "transparent",
  upColor: "#22c55e",
  downColor: "#ef4444",
  wickUpColor: "#22c55e",
  wickDownColor: "#ef4444",
  showVolume: true,
  volumeOpacity: 0.4,
  showCrosshair: true,
  showPriceLabel: true,
  autoScale: true,
};

const DEFAULT_INDICATORS: IndicatorConfig[] = [
  {
    id: "sma20",
    name: "SMA",
    enabled: false,
    color: "#3b82f6",
    lineWidth: 1.5,
    period: 20,
  },
  {
    id: "sma50",
    name: "SMA",
    enabled: false,
    color: "#06b6d4",
    lineWidth: 1.5,
    period: 50,
  },
  {
    id: "ema9",
    name: "EMA",
    enabled: false,
    color: "#f59e0b",
    lineWidth: 1.5,
    period: 9,
  },
  {
    id: "ema21",
    name: "EMA",
    enabled: false,
    color: "#eab308",
    lineWidth: 1.5,
    period: 21,
  },
  {
    id: "bollinger",
    name: "Bollinger Bands",
    enabled: false,
    color: "#8b5cf6",
    lineWidth: 1,
    period: 20,
    stdDev: 2,
  },
  {
    id: "vwap",
    name: "VWAP",
    enabled: false,
    color: "#ec4899",
    lineWidth: 1.5,
  },
];

const TIMEFRAMES: { label: string; value: Timeframe; shortLabel: string }[] = [
  { label: "1 Minute", value: "1m", shortLabel: "1m" },
  { label: "5 Minutes", value: "5m", shortLabel: "5m" },
  { label: "15 Minutes", value: "15m", shortLabel: "15m" },
  { label: "30 Minutes", value: "30m", shortLabel: "30m" },
  { label: "1 Hour", value: "1H", shortLabel: "1H" },
  { label: "4 Hours", value: "4H", shortLabel: "4H" },
  { label: "1 Day", value: "1D", shortLabel: "1D" },
  { label: "1 Week", value: "1W", shortLabel: "1W" },
];

const CHART_TYPES: {
  label: string;
  value: ChartType;
  icon: React.ReactNode;
}[] = [
  {
    label: "Candlestick",
    value: "candle",
    icon: <BarChart3 className="h-4 w-4" />,
  },
  { label: "Line", value: "line", icon: <Activity className="h-4 w-4" /> },
  { label: "Area", value: "area", icon: <Layers className="h-4 w-4" /> },
];

// Calculate indicators
function calculateSMA(data: number[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(undefined);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

function calculateEMA(data: number[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(undefined);
    } else if (i === period - 1) {
      const sum = data.slice(0, period).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    } else {
      const prevEma = result[i - 1] ?? data[i];
      result.push((data[i] - prevEma) * multiplier + prevEma);
    }
  }
  return result;
}

function calculateBollingerBands(
  data: number[],
  period = 20,
  stdDev = 2
): {
  upper: (number | undefined)[];
  middle: (number | undefined)[];
  lower: (number | undefined)[];
} {
  const sma = calculateSMA(data, period);
  const upper: (number | undefined)[] = [];
  const lower: (number | undefined)[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1 || sma[i] === undefined) {
      upper.push(undefined);
      lower.push(undefined);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = sma[i]!;
      const variance =
        slice.reduce((sum, val) => sum + (val - mean) ** 2, 0) / period;
      const std = Math.sqrt(variance);
      upper.push(mean + stdDev * std);
      lower.push(mean - stdDev * std);
    }
  }

  return { upper, middle: sma, lower };
}

function calculateVWAP(
  data: { close: number; volume: number }[]
): (number | undefined)[] {
  const result: (number | undefined)[] = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < data.length; i++) {
    const typicalPrice = data[i].close;
    cumulativeTPV += typicalPrice * data[i].volume;
    cumulativeVolume += data[i].volume;
    result.push(
      cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : undefined
    );
  }
  return result;
}

function calculateRSI(data: number[], period = 14): (number | undefined)[] {
  const result: (number | undefined)[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(undefined);
      continue;
    }

    const change = data[i] - data[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);

    if (i < period) {
      result.push(undefined);
    } else {
      const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }
  return result;
}

// Generate mock data
function generateCandleData(
  timeframe: Timeframe,
  count,
  indicators: IndicatorConfig[],
  initialPrice = 0.5
): CandleData[] {
  const now = Date.now();
  const intervals: Record<Timeframe, number> = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "30m": 30 * 60 * 1000,
    "1H": 60 * 60 * 1000,
    "4H": 4 * 60 * 60 * 1000,
    "1D": 24 * 60 * 60 * 1000,
    "1W": 7 * 24 * 60 * 60 * 1000,
  };

  const interval = intervals[timeframe];
  const volatility =
    timeframe === "1m" ? 0.002 : timeframe === "1D" ? 0.03 : 0.01;

  // Use initial price and ensure it stays within 0.01-0.99 range for prediction markets
  let basePrice = Math.max(0.05, Math.min(0.95, initialPrice));

  const rawData: CandleData[] = [];

  for (let i = 0; i < count; i++) {
    const timestamp = now - (count - i) * interval;
    const trend = Math.sin(i * 0.08) * 0.015 + Math.cos(i * 0.03) * 0.01;
    const noise = (Math.random() - 0.5) * volatility;

    const open = basePrice;
    const change = trend + noise;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    const volume = Math.floor(Math.random() * 100_000 + 20_000);

    rawData.push({
      time: formatTime(timestamp, timeframe),
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      isUp: close >= open,
    });

    basePrice = close;
  }

  // Calculate indicators
  const closePrices = rawData.map((d) => d.close);

  const sma20Indicator = indicators.find((i) => i.id === "sma20");
  const sma50Indicator = indicators.find((i) => i.id === "sma50");
  const ema9Indicator = indicators.find((i) => i.id === "ema9");
  const ema21Indicator = indicators.find((i) => i.id === "ema21");
  const bollingerIndicator = indicators.find((i) => i.id === "bollinger");
  const vwapIndicator = indicators.find((i) => i.id === "vwap");

  const sma20Values = sma20Indicator?.enabled
    ? calculateSMA(closePrices, sma20Indicator.period || 20)
    : [];
  const sma50Values = sma50Indicator?.enabled
    ? calculateSMA(closePrices, sma50Indicator.period || 50)
    : [];
  const ema9Values = ema9Indicator?.enabled
    ? calculateEMA(closePrices, ema9Indicator.period || 9)
    : [];
  const ema21Values = ema21Indicator?.enabled
    ? calculateEMA(closePrices, ema21Indicator.period || 21)
    : [];
  const bollinger = bollingerIndicator?.enabled
    ? calculateBollingerBands(
        closePrices,
        bollingerIndicator.period || 20,
        bollingerIndicator.stdDev || 2
      )
    : { upper: [], middle: [], lower: [] };
  const vwapValues = vwapIndicator?.enabled ? calculateVWAP(rawData) : [];
  const rsiValues = calculateRSI(closePrices, 14);

  return rawData.map((d, i) => ({
    ...d,
    sma20: sma20Values[i],
    sma50: sma50Values[i],
    ema9: ema9Values[i],
    ema21: ema21Values[i],
    bollingerUpper: bollinger.upper[i],
    bollingerMiddle: bollinger.middle[i],
    bollingerLower: bollinger.lower[i],
    vwap: vwapValues[i],
    rsi: rsiValues[i],
  }));
}

function formatTime(timestamp: number, timeframe: Timeframe): string {
  const date = new Date(timestamp);
  if (timeframe === "1W" || timeframe === "1D") {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (timeframe === "4H" || timeframe === "1H") {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Custom candlestick shape
function CandlestickBar(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: CandleData;
  dataMin?: number;
  dataMax?: number;
  settings?: ChartSettings;
}) {
  const {
    x = 0,
    width = 0,
    payload,
    dataMin = 0,
    dataMax = 1,
    settings,
  } = props;
  if (!payload) {
    return null;
  }

  const { open, close, high, low, isUp } = payload;
  const upColor = settings?.upColor || "#22c55e";
  const downColor = settings?.downColor || "#ef4444";
  const color = isUp ? upColor : downColor;

  const chartHeight = 300;
  const priceRange = dataMax - dataMin;
  const scale = chartHeight / priceRange;

  const bodyTop = Math.max(open, close);
  const bodyBottom = Math.min(open, close);

  const yHigh = (dataMax - high) * scale;
  const yLow = (dataMax - low) * scale;
  const yBodyTop = (dataMax - bodyTop) * scale;
  const yBodyBottom = (dataMax - bodyBottom) * scale;

  const bodyHeight = Math.max(yBodyBottom - yBodyTop, 1);
  const wickX = x + width / 2;

  return (
    <g>
      <line
        stroke={color}
        strokeWidth={1}
        x1={wickX}
        x2={wickX}
        y1={yHigh}
        y2={yLow}
      />
      <rect
        fill={color}
        height={bodyHeight}
        rx={1}
        width={width * 0.7}
        x={x + width * 0.15}
        y={yBodyTop}
      />
    </g>
  );
}

// Indicator Settings Dialog Component
function IndicatorSettingsDialog({
  indicator,
  onUpdate,
  onRemove,
}: {
  indicator: IndicatorConfig;
  onUpdate: (config: IndicatorConfig) => void;
  onRemove: () => void;
}) {
  const [localConfig, setLocalConfig] = useState(indicator);

  return (
    <Dialog>
      <DialogTrigger
        render={(props) => (
          <Button
            {...props}
            className="h-6 w-6 p-0 hover:bg-muted"
            size="sm"
            variant="ghost"
          >
            <Settings2 className="h-3 w-3" />
          </Button>
        )}
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: localConfig.color }}
            />
            {localConfig.name} ({localConfig.period})
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              <Input
                className="h-10 w-16 cursor-pointer p-1"
                onChange={(e) =>
                  setLocalConfig({ ...localConfig, color: e.target.value })
                }
                type="color"
                value={localConfig.color}
              />
              <Input
                className="flex-1 font-mono"
                onChange={(e) =>
                  setLocalConfig({ ...localConfig, color: e.target.value })
                }
                value={localConfig.color}
              />
            </div>
          </div>

          {localConfig.period !== undefined && (
            <div className="space-y-2">
              <Label>Period: {localConfig.period}</Label>
              <Slider
                max={200}
                min={1}
                onValueChange={([value]) =>
                  setLocalConfig({ ...localConfig, period: value })
                }
                step={1}
                value={[localConfig.period]}
              />
            </div>
          )}

          {localConfig.stdDev !== undefined && (
            <div className="space-y-2">
              <Label>Standard Deviation: {localConfig.stdDev}</Label>
              <Slider
                max={4}
                min={0.5}
                onValueChange={([value]) =>
                  setLocalConfig({ ...localConfig, stdDev: value })
                }
                step={0.5}
                value={[localConfig.stdDev]}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Line Width: {localConfig.lineWidth}px</Label>
            <Slider
              max={4}
              min={0.5}
              onValueChange={([value]) =>
                setLocalConfig({ ...localConfig, lineWidth: value })
              }
              step={0.5}
              value={[localConfig.lineWidth]}
            />
          </div>

          <div className="flex justify-between pt-4">
            <Button onClick={onRemove} size="sm" variant="destructive">
              <X className="mr-2 h-4 w-4" />
              Remove
            </Button>
            <Button onClick={() => onUpdate(localConfig)} size="sm">
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Chart Settings Dialog
function ChartSettingsDialog({
  settings,
  onUpdate,
}: {
  settings: ChartSettings;
  onUpdate: (settings: ChartSettings) => void;
}) {
  const [localSettings, setLocalSettings] = useState(settings);

  return (
    <Dialog>
      <DialogTrigger
        render={(props) => (
          <Button {...props} className="h-8 w-8" size="icon" variant="ghost">
            <Palette className="h-4 w-4" />
          </Button>
        )}
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Chart Settings</DialogTitle>
        </DialogHeader>
        <Tabs className="mt-4" defaultValue="appearance">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="candles">Candles</TabsTrigger>
            <TabsTrigger value="display">Display</TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-4 pt-4" value="appearance">
            <div className="space-y-2">
              <Label>Chart Type</Label>
              <Select
                onValueChange={(value: ChartType) =>
                  setLocalSettings({ ...localSettings, chartType: value })
                }
                value={localSettings.chartType}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <span className="flex items-center gap-2">
                        {type.icon}
                        {type.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label>Show Grid</Label>
              <Switch
                checked={localSettings.showGrid}
                onCheckedChange={(checked) =>
                  setLocalSettings({ ...localSettings, showGrid: checked })
                }
              />
            </div>

            {localSettings.showGrid && (
              <div className="space-y-2">
                <Label>Grid Color</Label>
                <div className="flex gap-2">
                  <Input
                    className="h-10 w-16 cursor-pointer p-1"
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        gridColor: e.target.value,
                      })
                    }
                    type="color"
                    value={localSettings.gridColor}
                  />
                  <Input
                    className="flex-1 font-mono text-sm"
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        gridColor: e.target.value,
                      })
                    }
                    value={localSettings.gridColor}
                  />
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent className="space-y-4 pt-4" value="candles">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Up Color</Label>
                <div className="flex gap-2">
                  <Input
                    className="h-10 w-full cursor-pointer p-1"
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        upColor: e.target.value,
                      })
                    }
                    type="color"
                    value={localSettings.upColor}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Down Color</Label>
                <div className="flex gap-2">
                  <Input
                    className="h-10 w-full cursor-pointer p-1"
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        downColor: e.target.value,
                      })
                    }
                    type="color"
                    value={localSettings.downColor}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Show Volume</Label>
              <Switch
                checked={localSettings.showVolume}
                onCheckedChange={(checked) =>
                  setLocalSettings({ ...localSettings, showVolume: checked })
                }
              />
            </div>

            {localSettings.showVolume && (
              <div className="space-y-2">
                <Label>
                  Volume Opacity:{" "}
                  {(localSettings.volumeOpacity * 100).toFixed(0)}%
                </Label>
                <Slider
                  max={1}
                  min={0.1}
                  onValueChange={([value]) =>
                    setLocalSettings({ ...localSettings, volumeOpacity: value })
                  }
                  step={0.1}
                  value={[localSettings.volumeOpacity]}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent className="space-y-4 pt-4" value="display">
            <div className="flex items-center justify-between">
              <Label>Show Crosshair</Label>
              <Switch
                checked={localSettings.showCrosshair}
                onCheckedChange={(checked) =>
                  setLocalSettings({ ...localSettings, showCrosshair: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Show Price Label</Label>
              <Switch
                checked={localSettings.showPriceLabel}
                onCheckedChange={(checked) =>
                  setLocalSettings({
                    ...localSettings,
                    showPriceLabel: checked,
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Auto Scale</Label>
              <Switch
                checked={localSettings.autoScale}
                onCheckedChange={(checked) =>
                  setLocalSettings({ ...localSettings, autoScale: checked })
                }
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between border-t pt-4">
          <Button
            onClick={() => setLocalSettings(DEFAULT_SETTINGS)}
            size="sm"
            variant="outline"
          >
            Reset to Default
          </Button>
          <Button onClick={() => onUpdate(localSettings)} size="sm">
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Add Indicator Dialog
function AddIndicatorDialog({
  onAdd,
}: {
  onAdd: (indicator: IndicatorConfig) => void;
}) {
  const AVAILABLE_INDICATORS = [
    {
      id: "sma",
      name: "Simple Moving Average (SMA)",
      defaultPeriod: 20,
      color: "#3b82f6",
    },
    {
      id: "ema",
      name: "Exponential Moving Average (EMA)",
      defaultPeriod: 9,
      color: "#f59e0b",
    },
    {
      id: "bollinger",
      name: "Bollinger Bands",
      defaultPeriod: 20,
      color: "#8b5cf6",
      stdDev: 2,
    },
    { id: "vwap", name: "VWAP", color: "#ec4899" },
  ];

  const [selectedType, setSelectedType] = useState("");
  const [period, setPeriod] = useState(20);
  const [color, setColor] = useState("#3b82f6");
  const [stdDev, setStdDev] = useState(2);

  const handleAdd = () => {
    if (!selectedType) {
      return;
    }

    const indicator = AVAILABLE_INDICATORS.find((i) => i.id === selectedType);
    if (!indicator) {
      return;
    }

    const newIndicator: IndicatorConfig = {
      id: `${selectedType}${period || ""}`,
      name: indicator.name.split(" (")[0],
      enabled: true,
      color,
      lineWidth: 1.5,
      period: indicator.defaultPeriod ? period : undefined,
      stdDev: indicator.stdDev ? stdDev : undefined,
    };

    onAdd(newIndicator);
    setSelectedType("");
  };

  return (
    <Dialog>
      <DialogTrigger
        render={(props) => (
          <Button
            {...props}
            className="h-7 gap-1 px-2 text-xs"
            size="sm"
            variant="ghost"
          >
            <Plus className="h-3 w-3" />
            Add
          </Button>
        )}
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Indicator</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Indicator Type</Label>
            <Select onValueChange={setSelectedType} value={selectedType}>
              <SelectTrigger>
                <SelectValue placeholder="Select an indicator" />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_INDICATORS.map((ind) => (
                  <SelectItem key={ind.id} value={ind.id}>
                    {ind.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedType &&
            AVAILABLE_INDICATORS.find((i) => i.id === selectedType)
              ?.defaultPeriod && (
              <div className="space-y-2">
                <Label>Period: {period}</Label>
                <Slider
                  max={200}
                  min={1}
                  onValueChange={([value]) => setPeriod(value)}
                  step={1}
                  value={[period]}
                />
              </div>
            )}

          {selectedType === "bollinger" && (
            <div className="space-y-2">
              <Label>Standard Deviation: {stdDev}</Label>
              <Slider
                max={4}
                min={0.5}
                onValueChange={([value]) => setStdDev(value)}
                step={0.5}
                value={[stdDev]}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              <Input
                className="h-10 w-16 cursor-pointer p-1"
                onChange={(e) => setColor(e.target.value)}
                type="color"
                value={color}
              />
              <Input
                className="flex-1 font-mono"
                onChange={(e) => setColor(e.target.value)}
                value={color}
              />
            </div>
          </div>

          <Button
            className="w-full"
            disabled={!selectedType}
            onClick={handleAdd}
          >
            Add Indicator
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface TradingChartProps {
  marketId?: string;
  marketName?: string;
  initialPrice?: number;
}

export function TradingChart({
  marketId,
  marketName,
  initialPrice,
}: TradingChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [data, setData] = useState<CandleData[]>([]);
  const [indicators, setIndicators] =
    useState<IndicatorConfig[]>(DEFAULT_INDICATORS);
  const [settings, setSettings] = useState<ChartSettings>(DEFAULT_SETTINGS);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const displayName = marketName || "Polymarket Agent";
  const basePrice = initialPrice ?? 0.5;
  const [isLive, setIsLive] = useState(true);

  // Generate initial data
  useEffect(() => {
    setData(generateCandleData(timeframe, 100, indicators, basePrice));
  }, [timeframe, indicators, basePrice]);

  // Real-time updates
  useEffect(() => {
    if (!isLive) {
      return;
    }

    const interval = setInterval(() => {
      setData((prev) => {
        if (prev.length === 0) {
          return prev;
        }

        const lastCandle = prev.at(-1);
        const volatility = 0.002;
        const newClose = lastCandle.close + (Math.random() - 0.5) * volatility;
        const newHigh = Math.max(lastCandle.high, newClose);
        const newLow = Math.min(lastCandle.low, newClose);

        const updatedData = [...prev];
        updatedData[updatedData.length - 1] = {
          ...lastCandle,
          close: newClose,
          high: newHigh,
          low: newLow,
          isUp: newClose >= lastCandle.open,
          volume: lastCandle.volume + Math.floor(Math.random() * 100),
        };

        // Recalculate last indicator values
        const closePrices = updatedData.map((d) => d.close);
        const lastIndex = updatedData.length - 1;

        if (lastIndex >= 19) {
          const sma20 =
            closePrices
              .slice(lastIndex - 19, lastIndex + 1)
              .reduce((a, b) => a + b, 0) / 20;
          updatedData[lastIndex].sma20 = sma20;
        }

        if (lastIndex >= 8) {
          const ema9Values = calculateEMA(closePrices, 9);
          updatedData[lastIndex].ema9 = ema9Values[lastIndex];
        }

        return updatedData;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isLive]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setData(generateCandleData(timeframe, 100, indicators, basePrice));
    setTimeout(() => setIsRefreshing(false), 500);
  }, [timeframe, indicators, basePrice]);

  const updateIndicator = useCallback((config: IndicatorConfig) => {
    setIndicators((prev) =>
      prev.map((ind) => (ind.id === config.id ? config : ind))
    );
  }, []);

  const removeIndicator = useCallback((id: string) => {
    setIndicators((prev) =>
      prev.map((ind) => (ind.id === id ? { ...ind, enabled: false } : ind))
    );
  }, []);

  const addIndicator = useCallback((config: IndicatorConfig) => {
    setIndicators((prev) => [...prev, config]);
  }, []);

  const toggleIndicator = useCallback((id: string) => {
    setIndicators((prev) =>
      prev.map((ind) =>
        ind.id === id ? { ...ind, enabled: !ind.enabled } : ind
      )
    );
  }, []);

  // Calculate price range
  const { dataMin, dataMax, currentPrice, priceChange, isPositive } =
    useMemo(() => {
      if (data.length === 0) {
        return {
          dataMin: 0,
          dataMax: 1,
          currentPrice: "0.00",
          priceChange: "0.00",
          isPositive: true,
        };
      }

      let min = Math.min(...data.map((d) => d.low));
      let max = Math.max(...data.map((d) => d.high));

      // Include Bollinger bands in range if enabled
      const bollingerEnabled = indicators.find(
        (i) => i.id === "bollinger"
      )?.enabled;
      if (bollingerEnabled) {
        const bollingerLows = data
          .map((d) => d.bollingerLower)
          .filter((v): v is number => v !== undefined);
        const bollingerHighs = data
          .map((d) => d.bollingerUpper)
          .filter((v): v is number => v !== undefined);
        if (bollingerLows.length > 0) {
          min = Math.min(min, ...bollingerLows);
        }
        if (bollingerHighs.length > 0) {
          max = Math.max(max, ...bollingerHighs);
        }
      }

      const padding = (max - min) * 0.1;
      min -= padding;
      max += padding;

      const current = data.at(-1);
      const first = data[0];
      const change = ((current.close - first.open) / first.open) * 100;

      return {
        dataMin: min,
        dataMax: max,
        currentPrice: current.close.toFixed(4),
        priceChange: change.toFixed(2),
        isPositive: change >= 0,
      };
    }, [data, indicators]);

  const maxVolume = useMemo(() => {
    return Math.max(...data.map((d) => d.volume));
  }, [data]);

  const enabledIndicators = useMemo(() => {
    return indicators.filter((i) => i.enabled);
  }, [indicators]);

  return (
    <Card className="flex flex-col border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-border border-b p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-muted-foreground text-xs">01</span>
            <h2
              className="max-w-50 truncate font-semibold text-foreground tracking-wide"
              title={displayName}
            >
              {displayName.length > 25
                ? `${displayName.slice(0, 25)}...`
                : displayName}
            </h2>
          </div>
          <Badge
            className={cn(
              "font-mono",
              isPositive
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            )}
            variant="outline"
          >
            ${currentPrice}
          </Badge>
          <Badge
            className={cn(
              "font-mono",
              isPositive
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            )}
            variant="outline"
          >
            {isPositive ? "+" : ""}
            {priceChange}%
          </Badge>

          {/* Live Indicator */}
          <button
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-xs transition-colors",
              isLive
                ? "bg-success/20 text-success"
                : "bg-muted text-muted-foreground"
            )}
            onClick={() => setIsLive(!isLive)}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isLive ? "animate-pulse bg-success" : "bg-muted-foreground"
              )}
            />
            {isLive ? "LIVE" : "PAUSED"}
          </button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            className="h-8 w-8"
            onClick={handleRefresh}
            size="icon"
            variant="ghost"
          >
            <RefreshCw
              className={cn("h-4 w-4", isRefreshing && "animate-spin")}
            />
          </Button>
          <Button className="h-8 w-8" size="icon" variant="ghost">
            <Crosshair className="h-4 w-4" />
          </Button>
          <Button className="h-8 w-8" size="icon" variant="ghost">
            <Camera className="h-4 w-4" />
          </Button>
          <ChartSettingsDialog onUpdate={setSettings} settings={settings} />
          <Button className="h-8 w-8" size="icon" variant="ghost">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Timeframe & Chart Type Controls */}
      <div className="flex items-center justify-between border-border border-b px-4 py-2">
        <div className="flex items-center gap-1">
          {/* Timeframe Dropdown for smaller screens */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={(props) => (
                <Button
                  {...props}
                  className="h-7 gap-1 bg-transparent px-2 text-xs md:hidden"
                  size="sm"
                  variant="outline"
                >
                  <Clock className="h-3 w-3" />
                  {timeframe}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              )}
            />
            <DropdownMenuContent align="start">
              {TIMEFRAMES.map((tf) => (
                <DropdownMenuCheckboxItem
                  checked={timeframe === tf.value}
                  key={tf.value}
                  onCheckedChange={() => setTimeframe(tf.value)}
                >
                  {tf.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Timeframe Buttons for larger screens */}
          <div className="hidden items-center gap-1 md:flex">
            {TIMEFRAMES.map((tf) => (
              <Button
                className={cn(
                  "h-7 px-2 text-xs",
                  timeframe === tf.value && "bg-primary text-primary-foreground"
                )}
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                size="sm"
                variant={timeframe === tf.value ? "default" : "ghost"}
              >
                {tf.shortLabel}
              </Button>
            ))}
          </div>

          <div className="mx-2 h-4 w-px bg-border" />

          {/* Chart Type */}
          <div className="flex items-center gap-1">
            {CHART_TYPES.map((type) => (
              <Button
                className={cn(
                  "h-7 w-7",
                  settings.chartType === type.value &&
                    "bg-primary text-primary-foreground"
                )}
                key={type.value}
                onClick={() =>
                  setSettings({ ...settings, chartType: type.value })
                }
                size="icon"
                variant={
                  settings.chartType === type.value ? "default" : "ghost"
                }
              >
                {type.icon}
              </Button>
            ))}
          </div>
        </div>

        {/* Indicators */}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={(props) => (
                <Button
                  {...props}
                  className="h-7 gap-1 px-2 text-xs"
                  size="sm"
                  variant="ghost"
                >
                  <TrendingUp className="h-3 w-3" />
                  Indicators
                  <ChevronDown className="h-3 w-3" />
                </Button>
              )}
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                Moving Averages
              </DropdownMenuLabel>
              {indicators
                .filter((i) => i.name === "SMA" || i.name === "EMA")
                .map((ind) => (
                  <DropdownMenuCheckboxItem
                    checked={ind.enabled}
                    key={ind.id}
                    onCheckedChange={() => toggleIndicator(ind.id)}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: ind.color }}
                      />
                      {ind.name} ({ind.period})
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                Volatility & Volume
              </DropdownMenuLabel>
              {indicators
                .filter(
                  (i) => i.name === "Bollinger Bands" || i.name === "VWAP"
                )
                .map((ind) => (
                  <DropdownMenuCheckboxItem
                    checked={ind.enabled}
                    key={ind.id}
                    onCheckedChange={() => toggleIndicator(ind.id)}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: ind.color }}
                      />
                      {ind.name}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <AddIndicatorDialog onAdd={addIndicator} />

          {/* Active Indicators */}
          <div className="hidden items-center gap-1 sm:flex">
            {enabledIndicators.slice(0, 4).map((ind) => (
              <Badge
                className="h-5 gap-1 px-1.5 text-xs"
                key={ind.id}
                style={{
                  borderColor: `${ind.color}30`,
                  backgroundColor: `${ind.color}10`,
                  color: ind.color,
                }}
                variant="outline"
              >
                {ind.name === "Bollinger Bands" ? "BB" : ind.name}
                {ind.period && ` ${ind.period}`}
                <IndicatorSettingsDialog
                  indicator={ind}
                  onRemove={() => removeIndicator(ind.id)}
                  onUpdate={updateIndicator}
                />
              </Badge>
            ))}
            {enabledIndicators.length > 4 && (
              <Badge className="h-5 px-1.5 text-xs" variant="outline">
                +{enabledIndicators.length - 4}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 p-4">
        <ChartContainer className="aspect-auto h-[320px] w-full" config={{}}>
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 60, bottom: 0, left: 0 }}
          >
            {settings.showGrid && (
              <>
                <defs>
                  <pattern
                    height="60"
                    id="grid"
                    patternUnits="userSpaceOnUse"
                    width="60"
                  >
                    <path
                      d="M 60 0 L 0 0 0 60"
                      fill="none"
                      stroke={settings.gridColor}
                      strokeWidth="0.5"
                    />
                  </pattern>
                </defs>
                <rect fill="url(#grid)" height="100%" width="100%" />
              </>
            )}

            <XAxis
              axisLine={false}
              dataKey="time"
              interval="preserveStartEnd"
              minTickGap={50}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              axisLine={false}
              domain={[dataMin, dataMax]}
              orientation="right"
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
              tickFormatter={(value) => `$${value.toFixed(2)}`}
              tickLine={false}
              width={55}
            />

            {/* Bollinger Bands */}
            {indicators.find((i) => i.id === "bollinger")?.enabled && (
              <>
                <Area
                  dataKey="bollingerUpper"
                  fill="transparent"
                  stroke="transparent"
                  type="monotone"
                />
                <Area
                  dataKey="bollingerLower"
                  fill={`${indicators.find((i) => i.id === "bollinger")?.color}15`}
                  stroke="transparent"
                  type="monotone"
                />
                <Line
                  connectNulls
                  dataKey="bollingerUpper"
                  dot={false}
                  stroke={indicators.find((i) => i.id === "bollinger")?.color}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  type="monotone"
                />
                <Line
                  connectNulls
                  dataKey="bollingerMiddle"
                  dot={false}
                  stroke={indicators.find((i) => i.id === "bollinger")?.color}
                  strokeWidth={1}
                  type="monotone"
                />
                <Line
                  connectNulls
                  dataKey="bollingerLower"
                  dot={false}
                  stroke={indicators.find((i) => i.id === "bollinger")?.color}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  type="monotone"
                />
              </>
            )}

            {/* Chart Type Rendering */}
            {settings.chartType === "candle" && (
              <Bar
                dataKey="high"
                isAnimationActive={false}
                shape={(props) => (
                  <CandlestickBar
                    {...props}
                    dataMax={dataMax}
                    dataMin={dataMin}
                    settings={settings}
                  />
                )}
              />
            )}

            {settings.chartType === "line" && (
              <Line
                dataKey="close"
                dot={false}
                stroke="var(--color-primary)"
                strokeWidth={2}
                type="monotone"
              />
            )}

            {settings.chartType === "area" && (
              <Area
                dataKey="close"
                fill="var(--color-primary)"
                fillOpacity={0.1}
                stroke="var(--color-primary)"
                strokeWidth={2}
                type="monotone"
              />
            )}

            {/* SMA Lines */}
            {indicators.find((i) => i.id === "sma20")?.enabled && (
              <Line
                connectNulls
                dataKey="sma20"
                dot={false}
                stroke={indicators.find((i) => i.id === "sma20")?.color}
                strokeWidth={
                  indicators.find((i) => i.id === "sma20")?.lineWidth
                }
                type="monotone"
              />
            )}

            {indicators.find((i) => i.id === "sma50")?.enabled && (
              <Line
                connectNulls
                dataKey="sma50"
                dot={false}
                stroke={indicators.find((i) => i.id === "sma50")?.color}
                strokeWidth={
                  indicators.find((i) => i.id === "sma50")?.lineWidth
                }
                type="monotone"
              />
            )}

            {/* EMA Lines */}
            {indicators.find((i) => i.id === "ema9")?.enabled && (
              <Line
                connectNulls
                dataKey="ema9"
                dot={false}
                stroke={indicators.find((i) => i.id === "ema9")?.color}
                strokeWidth={indicators.find((i) => i.id === "ema9")?.lineWidth}
                type="monotone"
              />
            )}

            {indicators.find((i) => i.id === "ema21")?.enabled && (
              <Line
                connectNulls
                dataKey="ema21"
                dot={false}
                stroke={indicators.find((i) => i.id === "ema21")?.color}
                strokeWidth={
                  indicators.find((i) => i.id === "ema21")?.lineWidth
                }
                type="monotone"
              />
            )}

            {/* VWAP */}
            {indicators.find((i) => i.id === "vwap")?.enabled && (
              <Line
                connectNulls
                dataKey="vwap"
                dot={false}
                stroke={indicators.find((i) => i.id === "vwap")?.color}
                strokeDasharray="5 5"
                strokeWidth={indicators.find((i) => i.id === "vwap")?.lineWidth}
                type="monotone"
              />
            )}

            {/* Current Price Reference Line */}
            {settings.showPriceLabel && (
              <ReferenceLine
                stroke="var(--color-primary)"
                strokeDasharray="4 4"
                strokeWidth={1}
                y={Number(currentPrice)}
              />
            )}

            <ChartTooltip
              content={({ active, payload, label }) => {
                if (!(active && payload?.length)) {
                  return null;
                }
                const candle = payload[0]?.payload as CandleData | undefined;
                if (!candle) {
                  return null;
                }
                return (
                  <div className="rounded-lg border border-border bg-card p-3 shadow-xl">
                    <div className="mb-2 text-muted-foreground text-xs">
                      {label}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">O:</span>
                        <span className="font-mono text-foreground">
                          ${candle.open.toFixed(4)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">H:</span>
                        <span className="font-mono text-success">
                          ${candle.high.toFixed(4)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">L:</span>
                        <span className="font-mono text-destructive">
                          ${candle.low.toFixed(4)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">C:</span>
                        <span
                          className={cn(
                            "font-mono",
                            candle.isUp ? "text-success" : "text-destructive"
                          )}
                        >
                          ${candle.close.toFixed(4)}
                        </span>
                      </div>
                    </div>
                    {enabledIndicators.length > 0 && (
                      <div className="mt-2 space-y-1 border-border border-t pt-2 text-xs">
                        {candle.sma20 !== undefined &&
                          indicators.find((i) => i.id === "sma20")?.enabled && (
                            <div className="flex justify-between">
                              <span
                                style={{
                                  color: indicators.find(
                                    (i) => i.id === "sma20"
                                  )?.color,
                                }}
                              >
                                SMA 20:
                              </span>
                              <span
                                className="font-mono"
                                style={{
                                  color: indicators.find(
                                    (i) => i.id === "sma20"
                                  )?.color,
                                }}
                              >
                                ${candle.sma20.toFixed(4)}
                              </span>
                            </div>
                          )}
                        {candle.ema9 !== undefined &&
                          indicators.find((i) => i.id === "ema9")?.enabled && (
                            <div className="flex justify-between">
                              <span
                                style={{
                                  color: indicators.find((i) => i.id === "ema9")
                                    ?.color,
                                }}
                              >
                                EMA 9:
                              </span>
                              <span
                                className="font-mono"
                                style={{
                                  color: indicators.find((i) => i.id === "ema9")
                                    ?.color,
                                }}
                              >
                                ${candle.ema9.toFixed(4)}
                              </span>
                            </div>
                          )}
                      </div>
                    )}
                    <div className="mt-2 border-border border-t pt-2 text-xs">
                      <span className="text-muted-foreground">Vol:</span>
                      <span className="ml-2 font-mono text-foreground">
                        {candle.volume.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
          </ComposedChart>
        </ChartContainer>

        {/* Volume Chart */}
        {settings.showVolume && (
          <ChartContainer className="mt-2 aspect-auto h-15 w-full" config={{}}>
            <ComposedChart
              data={data}
              margin={{ top: 0, right: 60, bottom: 0, left: 0 }}
            >
              <XAxis dataKey="time" hide />
              <YAxis
                axisLine={false}
                domain={[0, maxVolume]}
                orientation="right"
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
                tickLine={false}
                width={55}
              />
              <Bar dataKey="volume" isAnimationActive={false}>
                {data.map((entry, index) => (
                  <Cell
                    fill={
                      entry.isUp
                        ? `${settings.upColor}${Math.round(
                            settings.volumeOpacity * 255
                          )
                            .toString(16)
                            .padStart(2, "0")}`
                        : `${settings.downColor}${Math.round(
                            settings.volumeOpacity * 255
                          )
                            .toString(16)
                            .padStart(2, "0")}`
                    }
                    key={`cell-${index}`}
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ChartContainer>
        )}
      </div>

      {/* Stats Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-border border-t px-4 py-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">24H VOL</span>
            <span className="ml-2 font-mono text-foreground">$1.35M</span>
          </div>
          <div>
            <span className="text-muted-foreground">MCAP</span>
            <span className="ml-2 font-mono text-foreground">$6.79M</span>
          </div>
          <div>
            <span className="text-muted-foreground">LIQ</span>
            <span className="ml-2 font-mono text-primary">$365.41K</span>
          </div>
          <div className="hidden sm:block">
            <span className="text-muted-foreground">O</span>
            <span className="ml-1 font-mono text-foreground">
              {data.at(-1)?.open.toFixed(4) ?? "-"}
            </span>
          </div>
          <div className="hidden sm:block">
            <span className="text-muted-foreground">H</span>
            <span className="ml-1 font-mono text-success">
              {data.at(-1)?.high.toFixed(4) ?? "-"}
            </span>
          </div>
          <div className="hidden sm:block">
            <span className="text-muted-foreground">L</span>
            <span className="ml-1 font-mono text-destructive">
              {data.at(-1)?.low.toFixed(4) ?? "-"}
            </span>
          </div>
          <div className="hidden sm:block">
            <span className="text-muted-foreground">C</span>
            <span className="ml-1 font-mono text-foreground">
              {data.at(-1)?.close.toFixed(4) ?? "-"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="bg-success/10 text-success hover:bg-success/30"
            size="sm"
          >
            Buy YES
          </Button>
          <Button
            className="bg-destructive/10 text-destructive hover:bg-destructive/30"
            size="sm"
          >
            Buy NO
          </Button>
        </div>
      </div>
    </Card>
  );
}
