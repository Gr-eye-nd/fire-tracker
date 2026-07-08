"use client";

import { useState } from "react";
import {
  yearsToFire,
  superProjection,
  drawdownSchedule,
  savingsRate,
  coastFireNumber,
  sustainableSpend,
  totalNetWorth,
  type FireSnapshot,
} from "@/lib/calc-engine";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export default function Home() {
  const [age, setAge] = useState(30);
  const [salary, setSalary] = useState(100_000);
  const [expenses, setExpenses] = useState(60_000);
  const [superBalance, setSuperBalance] = useState(80_000);
  const [investments, setInvestments] = useState(50_000);
  const [cash, setCash] = useState(20_000);
  const [growthRate, setGrowthRate] = useState(7);
  const [retirementAge, setRetirementAge] = useState(65);
  const [swr, setSwr] = useState(4);

  const netWorth = totalNetWorth({
    super: superBalance,
    investments,
    property: 0,
    cash,
    other: 0,
  });
  const annualSavings = salary - expenses;
  const sr = savingsRate(salary, expenses);
  const rateDecimal = growthRate / 100;
  const swrDecimal = swr / 100;

  const fireResult = yearsToFire({
    currentNetWorth: netWorth,
    annualSavings,
    annualGrowthRate: rateDecimal,
    annualExpenses: expenses,
    currentAge: age,
    safeWithdrawalRate: swrDecimal,
  });

  const superResult = superProjection({
    currentBalance: superBalance,
    currentAge: age,
    retirementAge,
    annualSalary: salary,
    annualGrowthRate: rateDecimal,
  });

  const drawResult = drawdownSchedule({
    portfolioBalance: superResult.finalBalance + investments,
    annualWithdrawal: expenses,
    annualGrowthRate: rateDecimal,
    inflationRate: 0.025,
    currentAge: retirementAge,
    maxYears: 40,
  });

  const coastNumber = coastFireNumber({
    fireTarget: fireResult.targetFireNumber,
    annualGrowthRate: rateDecimal,
    yearsToRetirement: Math.max(retirementAge - age, 1),
  });

  const spend = sustainableSpend(netWorth, swrDecimal);

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-emerald-400">FI/RE Tracker</h1>
        <p className="text-gray-400 mt-1">
          Financial independence, retire early — your numbers, no fluff.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs */}
        <section className="lg:col-span-1 bg-gray-900 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-emerald-300">Your Details</h2>
          <Field label="Current age" value={age} onChange={setAge} min={18} max={80} />
          <Field
            label="Retirement age"
            value={retirementAge}
            onChange={setRetirementAge}
            min={age + 1}
            max={90}
          />
          <Field
            label="Annual salary (AUD)"
            value={salary}
            onChange={setSalary}
            step={5000}
            min={0}
            max={1_000_000}
            format="currency"
          />
          <Field
            label="Annual expenses (AUD)"
            value={expenses}
            onChange={setExpenses}
            step={1000}
            min={0}
            max={1_000_000}
            format="currency"
          />
          <Field
            label="Super balance (AUD)"
            value={superBalance}
            onChange={setSuperBalance}
            step={5000}
            min={0}
            max={5_000_000}
            format="currency"
          />
          <Field
            label="Investments outside super (AUD)"
            value={investments}
            onChange={setInvestments}
            step={5000}
            min={0}
            max={5_000_000}
            format="currency"
          />
          <Field
            label="Cash (AUD)"
            value={cash}
            onChange={setCash}
            step={1000}
            min={0}
            max={1_000_000}
            format="currency"
          />
          <Field
            label="Expected growth rate (%)"
            value={growthRate}
            onChange={setGrowthRate}
            step={0.5}
            min={1}
            max={15}
            format="percent"
          />
          <Field
            label="Safe withdrawal rate (%)"
            value={swr}
            onChange={setSwr}
            step={0.5}
            min={1}
            max={8}
            format="percent"
          />
        </section>

        {/* Results */}
        <div className="lg:col-span-2 space-y-6">
          {/* Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Metric label="Net worth" value={fmt(netWorth)} accent />
            <Metric label="Savings rate" value={fmtPct(sr)} good={sr >= 30} />
            <Metric label="FI/RE number" value={fmt(fireResult.targetFireNumber)} />
            <Metric
              label="FI/RE age"
              value={fireResult.fireAge ? String(fireResult.fireAge) : "60+ yrs"}
              good={
                fireResult.fireAge !== null && fireResult.fireAge <= retirementAge
              }
            />
            <Metric label="Coast FI number" value={fmt(coastNumber)} />
            <Metric label="Sustainable spend" value={`${fmt(spend)}/yr`} />
            <Metric label="Super at retirement" value={fmt(superResult.finalBalance)} />
            <Metric
              label="Portfolio lasts"
              value={
                drawResult.portfolioLasts
                  ? `${drawResult.portfolioLasts} yrs`
                  : "40+ yrs"
              }
              good={drawResult.portfolioLasts === null}
            />
          </div>

          {/* FI/RE progress chart */}
          <ChartSection title="FI/RE Progress">
            <ProgressChart
              schedule={fireResult.schedule}
              fireNumber={fireResult.targetFireNumber}
            />
          </ChartSection>

          {/* Super projection */}
          <ChartSection title="Super Balance Projection">
            <BarChart
              data={superResult.schedule.map((s) => ({
                label: String(s.age),
                value: s.balance,
              }))}
              color="emerald"
            />
          </ChartSection>

          {/* Drawdown */}
          <ChartSection title="Retirement Drawdown">
            <BarChart
              data={drawResult.schedule.map((s) => ({
                label: String(s.age),
                value: s.balance,
                depleted: s.depleted,
              }))}
              color="sky"
            />
          </ChartSection>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: "currency" | "percent";
}) {
  const display =
    format === "currency" ? fmt(value) : format === "percent" ? `${value}%` : String(value);

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <label className="text-gray-400">{label}</label>
        <span className="text-white font-medium tabular-nums">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-500 cursor-pointer"
      />
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  good,
}: {
  label: string;
  value: string;
  accent?: boolean;
  good?: boolean;
}) {
  const color =
    accent
      ? "text-emerald-400"
      : good === true
      ? "text-emerald-300"
      : good === false
      ? "text-amber-400"
      : "text-white";
  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function ChartSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

function ProgressChart({
  schedule,
  fireNumber,
}: {
  schedule: FireSnapshot[];
  fireNumber: number;
}) {
  if (schedule.length === 0) return <p className="text-gray-500 text-sm">No data</p>;
  const maxVal = Math.max(...schedule.map((s) => s.netWorth), fireNumber);

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1 h-32 min-w-max">
        {schedule.map((s) => {
          const heightPct = (s.netWorth / maxVal) * 100;
          const firePct = (fireNumber / maxVal) * 100;
          return (
            <div
              key={s.year}
              className="flex flex-col items-center gap-1 relative"
              style={{ minWidth: 24 }}
            >
              <div className="relative w-4" style={{ height: "128px" }}>
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-emerald-500/50"
                  style={{ bottom: `${firePct}%` }}
                />
                <div
                  className="absolute bottom-0 left-0 right-0 bg-emerald-600 rounded-t"
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              {s.year % 5 === 0 && (
                <span className="text-gray-600 text-xs">{s.age}</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-600 mt-2">Age · dashed line = FI/RE number</p>
    </div>
  );
}

function BarChart({
  data,
  color,
}: {
  data: { label: string; value: number; depleted?: boolean }[];
  color: "emerald" | "sky";
}) {
  if (data.length === 0) return <p className="text-gray-500 text-sm">No data</p>;
  const maxVal = Math.max(...data.map((d) => d.value));
  const barColor = color === "emerald" ? "bg-emerald-600" : "bg-sky-600";
  const deplColor = "bg-red-700";

  const step = Math.max(1, Math.floor(data.length / 20));
  const visible = data.filter((_, i) => i % step === 0);

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1 h-32 min-w-max">
        {visible.map((d) => {
          const heightPct = maxVal > 0 ? (d.value / maxVal) * 100 : 0;
          return (
            <div key={d.label} className="flex flex-col items-center gap-1" style={{ minWidth: 24 }}>
              <div
                className={`w-4 rounded-t ${d.depleted ? deplColor : barColor}`}
                style={{ height: `${Math.max(heightPct, 1)}%` }}
              />
              <span className="text-gray-600 text-xs">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
