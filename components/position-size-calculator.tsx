"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BarChart3, Plus, Trash2 } from "lucide-react";
import { formatCurrency, formatNumber, formatPercent, formatPrice } from "@/lib/format";

type Direction = "long" | "short";

type Scenario = {
  id: string;
  stockName: string;
  riskPctOfCapital: string;
  stockPrice: string;
  stopLossPrice: string;
  stopLossPct: string;
};

const R_LEVELS = [1, 2, 3, 4, 5];
const DEFAULT_STOP_LOSS_PCT = 2;
const SETTINGS_KEY = "stockscript-position-size-settings-v2";
const PERCENT_STEP = "0.1";
const ABSOLUTE_STEP = "0.5";

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPositive(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function money(value: number) {
  return formatNumber(value);
}

function pct2(value: number) {
  return `${value.toFixed(2)}%`;
}

function trimZeros(value: string) {
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return String(Number(num.toFixed(4)));
}

function stopPriceFromPct(price: number, pct: number, direction: Direction) {
  if (direction === "long") return price * (1 - pct / 100);
  return price * (1 + pct / 100);
}

function stopPctFromPrice(price: number, stopPrice: number) {
  if (price <= 0 || stopPrice <= 0) return 0;
  return (Math.abs(price - stopPrice) / price) * 100;
}

function buildScenario(
  id: number | string,
  stockName: string,
  stockPrice: number,
  riskPctOfCapital: number,
  direction: Direction,
): Scenario {
  const stopLossPrice = stopPriceFromPct(stockPrice, DEFAULT_STOP_LOSS_PCT, direction);

  return {
    id: `scenario-${id}`,
    stockName,
    riskPctOfCapital: String(riskPctOfCapital),
    stockPrice: String(stockPrice),
    stopLossPrice: formatPrice(stopLossPrice).replace(/,/g, ""),
    stopLossPct: String(DEFAULT_STOP_LOSS_PCT),
  };
}

function defaultScenarios(direction: Direction) {
  return [
    buildScenario(1, "Stock 1", 800, 0.25, direction),
    buildScenario(2, "Stock 2", 900, 0.3, direction),
    buildScenario(3, "Stock 3", 1000, 0.4, direction),
    buildScenario(4, "Stock 4", 1100, 0.5, direction),
    buildScenario(5, "Stock 5", 1200, 0.75, direction),
  ];
}

export function PositionSizeCalculator({
  initialCapital,
}: {
  initialCapital: number;
}) {
  const [direction, setDirection] = useState<Direction>("long");
  const [capital, setCapital] = useState(String(Math.round(initialCapital || 100000)));
  const [brokeragePct, setBrokeragePct] = useState("0.12");
  const [scenarios, setScenarios] = useState<Scenario[]>(defaultScenarios("long"));

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SETTINGS_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved) as {
        direction?: Direction;
        capital?: string;
        brokeragePct?: string;
        scenarios?: Scenario[];
      };

      if (parsed.direction === "long" || parsed.direction === "short") {
        setDirection(parsed.direction);
      }
      if (parsed.capital) setCapital(parsed.capital);
      if (parsed.brokeragePct) setBrokeragePct(parsed.brokeragePct);
      if (Array.isArray(parsed.scenarios) && parsed.scenarios.length > 0) {
        setScenarios(parsed.scenarios);
      }
    } catch {
      window.localStorage.removeItem(SETTINGS_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ direction, capital, brokeragePct, scenarios }),
    );
  }, [brokeragePct, capital, direction, scenarios]);

  const model = useMemo(() => {
    const portfolioCapital = clampPositive(toNumber(capital));
    const chargesPct = Math.max(0, toNumber(brokeragePct));

    const rows = scenarios.map((scenario) => {
      const stockPrice = clampPositive(toNumber(scenario.stockPrice));
      const stopLossPrice = clampPositive(toNumber(scenario.stopLossPrice));
      const riskPctOfCapital = Math.max(0, toNumber(scenario.riskPctOfCapital));
      const riskBudget = portfolioCapital * (riskPctOfCapital / 100);
      const stopLossPct = stopPctFromPrice(stockPrice, stopLossPrice);
      const stopDistance = Math.abs(stockPrice - stopLossPrice);
      const estimatedChargesPerShare =
        stockPrice * (chargesPct / 100) + stopLossPrice * (chargesPct / 100);
      const riskPerShare = stopDistance + estimatedChargesPerShare;
      const shares = riskPerShare > 0 ? Math.floor(riskBudget / riskPerShare) : 0;
      const investment = shares * stockPrice;
      const actualRisk = shares * riskPerShare;
      const allocationPct =
        portfolioCapital > 0 ? (investment / portfolioCapital) * 100 : 0;
      const tradeRiskPct = stockPrice > 0 ? (riskPerShare / stockPrice) * 100 : 0;
      const targetRows = R_LEVELS.map((level) => ({
        level,
        price:
          direction === "long"
            ? stockPrice + riskPerShare * level
            : stockPrice - riskPerShare * level,
      }));

      return {
        ...scenario,
        stockPrice,
        stopLossPrice,
        stopLossPct,
        riskPctOfCapital,
        riskBudget,
        riskPerShare,
        shares,
        investment,
        allocationPct,
        actualRisk,
        tradeRiskPct,
        targetRows,
      };
    });

    return { portfolioCapital, chargesPct, rows };
  }, [brokeragePct, capital, direction, scenarios]);

  function updateScenario(id: string, patch: Partial<Scenario>) {
    setScenarios((current) =>
      current.map((scenario) => {
        if (scenario.id !== id) return scenario;

        const next = { ...scenario, ...patch };
        const stockPrice = clampPositive(toNumber(next.stockPrice));

        if (patch.stockPrice !== undefined) {
          const stopLossPct = clampPositive(toNumber(next.stopLossPct, DEFAULT_STOP_LOSS_PCT));
          return {
            ...next,
            stopLossPrice:
              stockPrice > 0
                ? formatPrice(stopPriceFromPct(stockPrice, stopLossPct, direction)).replace(/,/g, "")
                : next.stopLossPrice,
          };
        }

        if (patch.stopLossPrice !== undefined) {
          const stopLossPrice = clampPositive(toNumber(next.stopLossPrice));
          return {
            ...next,
            stopLossPct:
              stockPrice > 0 && stopLossPrice > 0
                ? formatPrice(stopPctFromPrice(stockPrice, stopLossPrice)).replace(/,/g, "")
                : next.stopLossPct,
          };
        }

        if (patch.stopLossPct !== undefined) {
          const stopLossPct = clampPositive(toNumber(next.stopLossPct));
          return {
            ...next,
            stopLossPrice:
              stockPrice > 0
                ? formatPrice(stopPriceFromPct(stockPrice, stopLossPct, direction)).replace(/,/g, "")
                : next.stopLossPrice,
          };
        }

        return next;
      }),
    );
  }

  function handleDirectionChange(nextDirection: Direction) {
    setDirection(nextDirection);
    setScenarios((current) =>
      current.map((scenario) => {
        const stockPrice = clampPositive(toNumber(scenario.stockPrice));
        const stopLossPct = clampPositive(toNumber(scenario.stopLossPct, DEFAULT_STOP_LOSS_PCT));
        if (stockPrice <= 0) return scenario;

        return {
          ...scenario,
          stopLossPrice: formatPrice(
            stopPriceFromPct(stockPrice, stopLossPct, nextDirection),
          ).replace(/,/g, ""),
        };
      }),
    );
  }

  function addScenario() {
    setScenarios((current) => {
      const last = current[current.length - 1];
      const lastPrice = clampPositive(toNumber(last?.stockPrice)) || 1000;
      const lastRisk = clampPositive(toNumber(last?.riskPctOfCapital)) || 0.5;
      return [
        ...current,
        buildScenario(Date.now(), `Stock ${current.length + 1}`, Math.round(lastPrice * 1.05), lastRisk, direction),
      ];
    });
  }

  function removeScenario(id: string) {
    setScenarios((current) =>
      current.length <= 1 ? current : current.filter((scenario) => scenario.id !== id),
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <section className="rounded-2xl border border-line bg-panel px-5 py-5 shadow-sm sm:px-6 sm:py-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="hidden rounded-xl bg-accent/10 p-2.5 sm:block">
              <BarChart3 className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
                Position Sizing
              </p>
              <h1 className="mt-0.5 font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                Position Size Calculator
              </h1>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Compare share quantity, allocation, and trade risk across multiple stocks.
              </p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-end gap-2 sm:gap-3 md:w-auto">
            <label className="w-[140px] sm:w-[150px]">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
                Capital
              </span>
              <span className="flex h-10 items-center rounded-xl border border-line bg-white px-3.5 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10">
                <span className="mr-1 text-xs text-slate-400">₹</span>
                <input
                  type="number"
                  min="0"
                  step={ABSOLUTE_STEP}
                  value={capital}
                  onChange={(event) => setCapital(event.target.value)}
                  onBlur={() => setCapital(trimZeros(capital))}
                  className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none tabular-nums"
                />
              </span>
            </label>

            <label className="w-[110px] sm:w-[120px]">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
                Brokerage
              </span>
              <span className="flex h-10 items-center rounded-xl border border-line bg-white px-3.5 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10">
                <input
                  type="number"
                  min="0"
                  step={PERCENT_STEP}
                  value={brokeragePct}
                  onChange={(event) => setBrokeragePct(event.target.value)}
                  onBlur={() => setBrokeragePct(trimZeros(brokeragePct))}
                  className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none tabular-nums"
                />
                <span className="ml-1 text-xs text-slate-400">%</span>
              </span>
            </label>

            <div className="flex h-9 items-center gap-1 rounded-xl border border-line bg-canvas p-1">
              <button
                type="button"
                onClick={() => handleDirectionChange("long")}
                className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-[11px] font-medium transition ${
                  direction === "long"
                    ? "bg-white text-profit shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <ArrowUp className="h-3 w-3" />
                Long
              </button>
              <button
                type="button"
                onClick={() => handleDirectionChange("short")}
                className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-[11px] font-medium transition ${
                  direction === "short"
                    ? "bg-white text-loss shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <ArrowDown className="h-3 w-3" />
                Short
              </button>
            </div>

            <button
              type="button"
              onClick={addScenario}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-medium text-white transition hover:bg-accentDeep hover:shadow-md active:scale-[0.97]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Stock
            </button>
          </div>
        </div>
      </section>

      {/* Desktop Table */}
      <section className="hidden overflow-hidden rounded-2xl border border-line bg-panel shadow-sm lg:block">
        <div className="overflow-x-auto sticky-head">
          <table className="w-full text-right text-[12px] text-slate-700">
            <thead>
              <tr className="border-b border-line bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600">
                <th className="border-r border-line/30 px-4 py-3 text-left">
                  Inputs
                </th>
                {model.rows.map((row, index) => (
                  <th key={row.id} className="min-w-[150px] border-r border-line/30 px-3 py-3 text-right font-medium text-ink">
                    <div className="flex items-center justify-end gap-2">
                      <input
                        type="text"
                        value={scenarios[index].stockName}
                        onChange={(event) => updateScenario(row.id, { stockName: event.target.value })}
                        aria-label={`Stock name ${index + 1}`}
                        className="h-8 w-full max-w-[110px] rounded-lg border border-line bg-white px-2.5 text-right text-xs text-slate-700 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10"
                      />
                      {model.rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeScenario(row.id)}
                          className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-loss/10 hover:text-loss"
                          aria-label={`Remove ${row.stockName || `stock ${index + 1}`}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <EditableRow
                label="Risk %"
                suffix="%"
                step={PERCENT_STEP}
                values={scenarios.map((scenario) => scenario.riskPctOfCapital)}
                onChange={(index, value) =>
                  updateScenario(scenarios[index].id, { riskPctOfCapital: value })
                }
              />
              <EditableRow
                label="Stock Price"
                prefix="₹"
                step={ABSOLUTE_STEP}
                values={scenarios.map((scenario) => scenario.stockPrice)}
                onChange={(index, value) =>
                  updateScenario(scenarios[index].id, { stockPrice: value })
                }
              />
              <StopLossRow
                scenarios={scenarios}
                onStopPriceChange={(index, value) =>
                  updateScenario(scenarios[index].id, { stopLossPrice: value })
                }
                onStopPctChange={(index, value) =>
                  updateScenario(scenarios[index].id, { stopLossPct: value })
                }
              />
              <ResultRow
                label="Shares"
                values={model.rows.map((row) => formatNumber(row.shares))}
                highlight
              />
              <ResultRow
                label="Investment (₹)"
                values={model.rows.map((row) => money(row.investment))}
              />
              <ResultRow
                label="Allocation %"
                values={model.rows.map((row) => formatPercent(row.allocationPct))}
                highlight
              />
              <ResultRow
                label="Risk (₹)"
                values={model.rows.map((row) => money(row.actualRisk))}
              />
              <ResultRow
                label="Risk (%)"
                values={model.rows.map((row) => pct2(row.tradeRiskPct))}
              />
              <tr className="border-b border-line bg-slate-50">
                <th
                  className="border-r border-line/30 px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400"
                  colSpan={model.rows.length + 1}
                >
                  {direction === "long" ? "Entry + R targets" : "Entry − R targets"}
                </th>
              </tr>
              {R_LEVELS.map((level) => (
                <ResultRow
                  key={level}
                  label={`${level}R`}
                  values={model.rows.map((row) => {
                    const target = row.targetRows.find((item) => item.level === level);
                    return formatPrice(target?.price ?? 0);
                  })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Mobile Cards */}
      <div className="space-y-4 lg:hidden">
        {model.rows.map((row, index) => (
          <section key={row.id} className="rounded-2xl border border-line bg-panel shadow-sm">
            <div className="flex items-center justify-between border-b border-line/50 px-4 py-3">
              <input
                type="text"
                value={scenarios[index].stockName}
                onChange={(event) => updateScenario(row.id, { stockName: event.target.value })}
                aria-label={`Stock name ${index + 1}`}
                className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10"
              />
              {model.rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeScenario(row.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-loss/10 hover:text-loss"
                  aria-label={`Remove ${row.stockName || `stock ${index + 1}`}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="divide-y divide-line/20">
              <MobileFieldRow
                label="Risk %"
                value={scenarios[index].riskPctOfCapital}
                onChange={(value) => updateScenario(row.id, { riskPctOfCapital: value })}
                suffix="%"
                step={PERCENT_STEP}
              />
              <MobileFieldRow
                label="Stock Price"
                value={scenarios[index].stockPrice}
                onChange={(value) => updateScenario(row.id, { stockPrice: value })}
                prefix="₹"
                step={ABSOLUTE_STEP}
              />
              <MobileFieldRow
                label="Stop Loss"
                value={scenarios[index].stopLossPrice}
                onChange={(value) => updateScenario(row.id, { stopLossPrice: value })}
                prefix="₹"
                step={ABSOLUTE_STEP}
              />
              <MobileFieldRow
                label="Stop Loss %"
                value={scenarios[index].stopLossPct}
                onChange={(value) => updateScenario(row.id, { stopLossPct: value })}
                suffix="%"
                step={PERCENT_STEP}
              />
            </div>

            <div className="divide-y divide-line/20 border-t border-line/50">
              <MobileResultRow label="Shares" value={formatNumber(row.shares)} highlight />
              <MobileResultRow label="Investment" value={`₹ ${money(row.investment)}`} />
              <MobileResultRow label="Allocation" value={formatPercent(row.allocationPct)} highlight />
              <MobileResultRow label="Risk" value={`₹ ${money(row.actualRisk)}`} />
              <MobileResultRow label="Trade Risk" value={pct2(row.tradeRiskPct)} />
            </div>

            <div className="border-t border-line/50 bg-slate-50 px-4 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
                {direction === "long" ? "Entry + R targets" : "Entry − R targets"}
              </p>
            </div>
            <div className="divide-y divide-line/20">
              {R_LEVELS.map((level) => {
                const target = row.targetRows.find((item) => item.level === level);
                return (
                  <div key={level} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-slate-500">{level}R</span>
                    <span className="font-mono text-xs text-slate-700 tabular-nums">
                      {formatPrice(target?.price ?? 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function EditableRow({
  label,
  values,
  onChange,
  prefix,
  suffix,
  step = ABSOLUTE_STEP,
}: {
  label: string;
  values: string[];
  onChange: (index: number, value: string) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
}) {
  return (
    <tr className="bg-white">
      <th className="whitespace-nowrap border-r border-line/30 bg-white px-4 py-3 text-left text-xs font-medium text-slate-600">
        {label}
      </th>
      {values.map((value, index) => (
        <td key={`${label}-${index}`} className="border-r border-line/30 px-3 py-2 text-right">
          <span className="ml-auto flex h-9 max-w-[110px] items-center rounded-lg border border-line bg-white px-3 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10">
            {prefix && <span className="mr-1 text-xs text-slate-400">{prefix}</span>}
            <input
              type="number"
              min="0"
              step={step}
              value={value}
              onChange={(event) => onChange(index, event.target.value)}
              onBlur={() => onChange(index, trimZeros(value))}
              className="h-full min-w-0 flex-1 bg-transparent text-right text-xs text-slate-700 outline-none tabular-nums"
            />
            {suffix && <span className="ml-1 text-xs text-slate-400">{suffix}</span>}
          </span>
        </td>
      ))}
    </tr>
  );
}

function StopLossRow({
  scenarios,
  onStopPriceChange,
  onStopPctChange,
}: {
  scenarios: Scenario[];
  onStopPriceChange: (index: number, value: string) => void;
  onStopPctChange: (index: number, value: string) => void;
}) {
  return (
    <tr className="bg-white">
      <th className="whitespace-nowrap border-r border-line/30 bg-white px-4 py-3 text-left text-xs font-medium text-slate-600">
        SL / SL%
      </th>
      {scenarios.map((scenario, index) => (
        <td key={`sl-${scenario.id}`} className="border-r border-line/30 px-3 py-2 text-right">
          <div className="flex justify-end gap-1.5">
            <span className="flex h-9 max-w-[80px] items-center rounded-lg border border-line bg-white px-2.5 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10">
              <span className="mr-0.5 text-[10px] text-slate-400">₹</span>
              <input
                type="number"
                min="0"
                step={ABSOLUTE_STEP}
                value={scenario.stopLossPrice}
                onChange={(event) => onStopPriceChange(index, event.target.value)}
                onBlur={() => onStopPriceChange(index, trimZeros(scenario.stopLossPrice))}
                className="h-full min-w-0 flex-1 bg-transparent text-right text-xs text-slate-700 outline-none tabular-nums"
              />
            </span>
            <span className="flex h-9 max-w-[72px] items-center rounded-lg border border-line bg-white px-2.5 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10">
              <input
                type="number"
                min="0"
                step={PERCENT_STEP}
                value={scenario.stopLossPct}
                onChange={(event) => onStopPctChange(index, event.target.value)}
                onBlur={() => onStopPctChange(index, trimZeros(scenario.stopLossPct))}
                className="h-full min-w-0 flex-1 bg-transparent text-right text-xs text-slate-700 outline-none tabular-nums"
              />
              <span className="ml-0.5 text-[10px] text-slate-400">%</span>
            </span>
          </div>
        </td>
      ))}
    </tr>
  );
}

function ResultRow({
  label,
  values,
  highlight,
}: {
  label: string;
  values: string[];
  highlight?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-accent/[0.03]" : "bg-white"}>
      <th className={`whitespace-nowrap border-r border-line/30 px-4 py-3 text-left text-xs font-medium text-slate-600 ${highlight ? "bg-accent/[0.03]" : "bg-white"}`}>
        {label}
      </th>
      {values.map((value, index) => (
        <td
          key={`${label}-${index}`}
          className={`border-r border-line/30 px-3 py-2.5 text-right font-mono text-xs tabular-nums ${highlight ? "font-medium text-accent" : "text-slate-700"}`}
        >
          {value}
        </td>
      ))}
    </tr>
  );
}

function MobileFieldRow({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = ABSOLUTE_STEP,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="flex h-9 max-w-[130px] items-center rounded-lg border border-line bg-white px-3 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10">
        {prefix && <span className="mr-1 text-xs text-slate-400">{prefix}</span>}
        <input
          type="number"
          min="0"
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onChange(trimZeros(value))}
          className="h-full min-w-0 flex-1 bg-transparent text-right text-xs text-slate-700 outline-none tabular-nums"
        />
        {suffix && <span className="ml-1 text-xs text-slate-400">{suffix}</span>}
      </span>
    </div>
  );
}

function MobileResultRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 ${highlight ? "bg-accent/[0.03]" : ""}`}>
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`font-mono text-xs tabular-nums ${highlight ? "font-medium text-accent" : "text-slate-700"}`}>{value}</span>
    </div>
  );
}
