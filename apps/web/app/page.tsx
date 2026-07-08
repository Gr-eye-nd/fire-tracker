"use client";

import { useState } from "react";
import {
  superProjection,
  compoundGrowthSchedule,
  drawdownSchedule,
  yearsToFire,
  savingsRate,
  coastFireNumber,
  sustainableSpend,
  fireNumber as calcFireNumber,
} from "@/lib/calc-engine";

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);

const fmtK = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `$${(n / 1_000).toFixed(0)}K`
    : fmt(n);

// ─── Chart constants ──────────────────────────────────────────────────────────

const CHART_H = 160; // px — fixed so percentage heights work

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Home() {
  // Personal
  const [age, setAge] = useState(30);
  const [retirementAge, setRetirementAge] = useState(65);

  // Super
  const [superBalance, setSuperBalance] = useState(80_000);
  const [superExtraConcessional, setSuperExtraConcessional] = useState(0);
  const [superNonConcessional, setSuperNonConcessional] = useState(0);
  const [superGrowthRate, setSuperGrowthRate] = useState(7);

  // Investments outside super
  const [investBalance, setInvestBalance] = useState(50_000);
  const [investContribution, setInvestContribution] = useState(20_000);
  const [investGrowthRate, setInvestGrowthRate] = useState(8);
  const [cashBalance, setCashBalance] = useState(20_000);

  // Income
  const [salary, setSalary] = useState(100_000);
  const [otherIncome, setOtherIncome] = useState(0);

  // Expenses
  const [annualExpenses, setAnnualExpenses] = useState(60_000);

  // Settings
  const [swr, setSwr] = useState(4);

  // ── Derived values ──────────────────────────────────────────────────────────

  const totalIncome = salary + otherIncome;
  const annualSurplus = totalIncome - annualExpenses;
  const sr = savingsRate(totalIncome, annualExpenses);
  const netWorth = superBalance + investBalance + cashBalance;
  const swrDecimal = swr / 100;
  const superRate = superGrowthRate / 100;
  const investRate = investGrowthRate / 100;
  const yearsToRetire = Math.max(retirementAge - age, 1);
  const blendedRate = (superRate + investRate) / 2;

  // FI/RE
  const target = calcFireNumber(annualExpenses, swrDecimal);
  const coast = coastFireNumber({ fireTarget: target, annualGrowthRate: blendedRate, yearsToRetirement: yearsToRetire });
  const fireResult = yearsToFire({
    currentNetWorth: netWorth,
    annualSavings: annualSurplus,
    annualGrowthRate: blendedRate,
    annualExpenses,
    currentAge: age,
    safeWithdrawalRate: swrDecimal,
    maxYears: 60,
  });

  // Full net-worth projection to retirement (for FI/RE progress chart)
  const nwSchedule = compoundGrowthSchedule({
    principal: netWorth,
    annualRate: blendedRate,
    years: Math.max(yearsToRetire + 10, 30),
    annualContribution: annualSurplus,
    currentAge: age,
  });

  // Super projection
  const superResult = superProjection({
    currentBalance: superBalance,
    currentAge: age,
    retirementAge,
    annualSalary: salary,
    extraConcessional: superExtraConcessional,
    nonConcessionalAnnual: superNonConcessional,
    annualGrowthRate: superRate,
  });

  // Investments outside super projection
  const investSchedule = compoundGrowthSchedule({
    principal: investBalance + cashBalance,
    annualRate: investRate,
    years: yearsToRetire,
    annualContribution: investContribution,
    currentAge: age,
  });

  // Retirement drawdown
  const retirementPortfolio =
    superResult.finalBalance + (investSchedule[investSchedule.length - 1]?.balance ?? investBalance);
  const drawResult = drawdownSchedule({
    portfolioBalance: retirementPortfolio,
    annualWithdrawal: annualExpenses,
    annualGrowthRate: blendedRate,
    inflationRate: 0.025,
    currentAge: retirementAge,
    maxYears: 40,
  });

  const spend = sustainableSpend(netWorth, swrDecimal);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-3">
        <span className="text-2xl font-bold text-emerald-400">FI/RE</span>
        <span className="text-gray-500 text-sm">Financial Independence, Retire Early</span>
      </header>

      <div className="flex flex-col lg:flex-row gap-0 min-h-[calc(100vh-57px)]">
        {/* ── Left panel: inputs ─────────────────────────────────────────── */}
        <aside className="lg:w-80 lg:min-w-80 bg-gray-900 border-r border-gray-800 p-5 space-y-6 overflow-y-auto">

          <InputSection title="Personal">
            <SliderField label="Current age" value={age} onChange={setAge} min={18} max={75} />
            <SliderField label="Retirement age" value={retirementAge} onChange={setRetirementAge} min={age + 1} max={90} />
            <SliderField label="Safe withdrawal rate" value={swr} onChange={setSwr} min={2} max={8} step={0.5} suffix="%" />
          </InputSection>

          <InputSection title="Superannuation">
            <SliderField label="Current balance" value={superBalance} onChange={setSuperBalance} min={0} max={2_000_000} step={5_000} prefix="$" format="currency" />
            <SliderField label="Extra concessional (salary sacrifice)" value={superExtraConcessional} onChange={setSuperExtraConcessional} min={0} max={27_500} step={500} prefix="$" format="currency" note="Cap: $30k/yr incl. employer SG" />
            <SliderField label="Non-concessional (after-tax)" value={superNonConcessional} onChange={setSuperNonConcessional} min={0} max={120_000} step={1_000} prefix="$" format="currency" note="Cap: $120k/yr" />
            <SliderField label="Growth rate (p.a.)" value={superGrowthRate} onChange={setSuperGrowthRate} min={2} max={14} step={0.5} suffix="%" />
          </InputSection>

          <InputSection title="Investments outside super">
            <SliderField label="Current balance" value={investBalance} onChange={setInvestBalance} min={0} max={2_000_000} step={5_000} prefix="$" format="currency" />
            <SliderField label="Cash / savings" value={cashBalance} onChange={setCashBalance} min={0} max={500_000} step={1_000} prefix="$" format="currency" />
            <SliderField label="Annual contributions" value={investContribution} onChange={setInvestContribution} min={0} max={200_000} step={1_000} prefix="$" format="currency" />
            <SliderField label="Growth rate (p.a.)" value={investGrowthRate} onChange={setInvestGrowthRate} min={2} max={20} step={0.5} suffix="%" />
          </InputSection>

          <InputSection title="Income">
            <SliderField label="Salary (gross)" value={salary} onChange={setSalary} min={0} max={500_000} step={5_000} prefix="$" format="currency" />
            <SliderField label="Other income" value={otherIncome} onChange={setOtherIncome} min={0} max={200_000} step={1_000} prefix="$" format="currency" note="Dividends, rent, side income" />
          </InputSection>

          <InputSection title="Expenses">
            <SliderField label="Annual living expenses" value={annualExpenses} onChange={setAnnualExpenses} min={10_000} max={300_000} step={1_000} prefix="$" format="currency" />
          </InputSection>
        </aside>

        {/* ── Right panel: metrics + charts ─────────────────────────────── */}
        <div className="flex-1 p-5 space-y-6 overflow-y-auto">

          {/* Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Net worth" value={fmtK(netWorth)} />
            <Metric label="Savings rate" value={`${sr.toFixed(0)}%`} good={sr >= 30} bad={sr < 10} />
            <Metric label="FI/RE number" value={fmtK(target)} />
            <Metric
              label="FI/RE age"
              value={fireResult.fireAge !== null ? String(fireResult.fireAge) : "60+ yrs"}
              good={fireResult.fireAge !== null && fireResult.fireAge <= retirementAge}
            />
            <Metric label="Coast FI number" value={fmtK(coast)} note="Invest this now, stop saving" />
            <Metric label="Sustainable spend" value={`${fmtK(spend)}/yr`} note="At current net worth" />
            <Metric label="Super at retirement" value={fmtK(superResult.finalBalance)} />
            <Metric
              label="Retirement portfolio"
              value={fmtK(retirementPortfolio)}
              good={drawResult.portfolioLasts === null}
              note={drawResult.portfolioLasts ? `Depleted yr ${drawResult.portfolioLasts}` : "Survives 40 yrs"}
            />
          </div>

          {/* FI/RE Progress */}
          <Card title="FI/RE Progress" description={`Net worth growing toward ${fmtK(target)} target (${swr}% SWR). Dashed line = FI/RE number.${fireResult.fireAge ? ` Reached at age ${fireResult.fireAge}.` : ""}`}>
            <LineChart
              data={nwSchedule.map((s) => ({ age: s.age, value: s.balance }))}
              threshold={target}
              color="emerald"
            />
          </Card>

          {/* Income vs Expenses */}
          <Card title="Income & Expenses" description="Annual income, expenses, and surplus going toward investments.">
            <IncomeExpenseChart
              income={totalIncome}
              expenses={annualExpenses}
              surplus={annualSurplus}
            />
          </Card>

          {/* Super Projection */}
          <Card
            title="Superannuation Projection"
            description={`Balance grows from ${fmtK(superBalance)} to ~${fmtK(superResult.finalBalance)} at retirement (${retirementAge}). Includes ${salary > 0 ? `${(salary * 0.12).toFixed(0) === "0" ? "SG" : "12% SG"}` : "SG"} + extra contributions, 15% contributions tax, 15% earnings tax.`}
          >
            <BarChart
              data={superResult.schedule.map((s) => ({ age: s.age, value: s.balance }))}
              color="emerald"
            />
          </Card>

          {/* Investments outside super */}
          <Card
            title="Investments Outside Super"
            description={`Non-super portfolio (shares, ETFs, cash) growing at ${investGrowthRate}% p.a. with ${fmtK(investContribution)}/yr contributions.`}
          >
            <BarChart
              data={investSchedule.map((s) => ({ age: s.age, value: s.balance }))}
              color="sky"
            />
          </Card>

          {/* Drawdown */}
          <Card
            title="Retirement Drawdown"
            description={`Starting with ${fmtK(retirementPortfolio)} at age ${retirementAge}, withdrawing ${fmtK(annualExpenses)}/yr inflation-adjusted. ${drawResult.portfolioLasts ? `Portfolio depleted at year ${drawResult.portfolioLasts}.` : "Portfolio survives 40 years."}`}
          >
            <BarChart
              data={drawResult.schedule.map((s) => ({ age: s.age, value: s.balance, depleted: s.depleted }))}
              color="violet"
            />
          </Card>
        </div>
      </div>
    </main>
  );
}

// ─── Input components ─────────────────────────────────────────────────────────

function InputSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-emerald-500 uppercase tracking-widest mb-3">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix,
  suffix,
  format,
  note,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  format?: "currency";
  note?: string;
}) {
  const display =
    format === "currency"
      ? fmt(value)
      : `${prefix ?? ""}${value}${suffix ?? ""}`;

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline gap-2">
        <label className="text-xs text-gray-400 leading-snug">{label}</label>
        <span className="text-sm font-semibold text-white tabular-nums whitespace-nowrap">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 accent-emerald-500 cursor-pointer"
      />
      {note && <p className="text-xs text-gray-600">{note}</p>}
    </div>
  );
}

// ─── Metric card ─────────────────────────────────────────────────────────────

function Metric({
  label,
  value,
  good,
  bad,
  note,
}: {
  label: string;
  value: string;
  good?: boolean;
  bad?: boolean;
  note?: string;
}) {
  const color =
    good === true ? "text-emerald-400" : bad === true ? "text-amber-400" : "text-white";
  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
      <p className="text-xs text-gray-500 uppercase tracking-wide leading-none mb-1.5">{label}</p>
      <p className={`text-lg font-bold tabular-nums leading-none ${color}`}>{value}</p>
      {note && <p className="text-xs text-gray-600 mt-1">{note}</p>}
    </div>
  );
}

// ─── Chart wrapper ────────────────────────────────────────────────────────────

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
      <p className="text-xs text-gray-500 mb-4 leading-relaxed">{description}</p>
      {children}
    </div>
  );
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

const barColors: Record<string, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
};

function BarChart({
  data,
  color,
}: {
  data: { age: number; value: number; depleted?: boolean }[];
  color: keyof typeof barColors;
}) {
  if (data.length === 0) return <p className="text-gray-600 text-sm">No data</p>;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barColor = barColors[color] ?? "bg-gray-500";
  const labelEvery = Math.max(1, Math.floor(data.length / 10));

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-0.5 min-w-max" style={{ height: CHART_H }}>
        {data.map((d, i) => {
          const h = Math.max(Math.round((d.value / maxVal) * CHART_H), 2);
          return (
            <div
              key={i}
              title={`Age ${d.age}: ${fmt(d.value)}`}
              className={`w-4 flex-shrink-0 rounded-sm ${d.depleted ? "bg-red-600" : barColor}`}
              style={{ height: h }}
            />
          );
        })}
      </div>
      <div className="flex gap-0.5 mt-1 min-w-max">
        {data.map((d, i) => (
          <div key={i} className="w-4 flex-shrink-0 text-center">
            {i % labelEvery === 0 && (
              <span className="text-xs text-gray-600">{d.age}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Line chart (FI/RE progress) ─────────────────────────────────────────────

function LineChart({
  data,
  threshold,
  color,
}: {
  data: { age: number; value: number }[];
  threshold: number;
  color: keyof typeof barColors;
}) {
  if (data.length === 0) return <p className="text-gray-600 text-sm">No data</p>;

  const maxVal = Math.max(...data.map((d) => d.value), threshold * 1.05);
  const barColor = barColors[color] ?? "bg-gray-500";
  const thresholdH = Math.round((threshold / maxVal) * CHART_H);
  const labelEvery = Math.max(1, Math.floor(data.length / 10));
  const fireIdx = data.findIndex((d) => d.value >= threshold);

  return (
    <div className="overflow-x-auto">
      <div className="relative min-w-max" style={{ height: CHART_H }}>
        {/* FI/RE threshold line */}
        <div
          className="absolute left-0 right-0 border-t border-dashed border-emerald-400/60 pointer-events-none"
          style={{ bottom: thresholdH }}
        >
          <span className="absolute right-0 -top-4 text-xs text-emerald-500 whitespace-nowrap pr-1">
            FI/RE {fmtK(threshold)}
          </span>
        </div>

        {/* Bars */}
        <div className="flex items-end gap-0.5 h-full">
          {data.map((d, i) => {
            const h = Math.max(Math.round((d.value / maxVal) * CHART_H), 2);
            const reached = fireIdx !== -1 && i >= fireIdx;
            return (
              <div
                key={i}
                title={`Age ${d.age}: ${fmt(d.value)}`}
                className={`w-4 flex-shrink-0 rounded-sm ${reached ? "bg-emerald-400" : barColor}`}
                style={{ height: h }}
              />
            );
          })}
        </div>
      </div>

      {/* Age labels */}
      <div className="flex gap-0.5 mt-1 min-w-max">
        {data.map((d, i) => (
          <div key={i} className="w-4 flex-shrink-0 text-center">
            {i % labelEvery === 0 && (
              <span className="text-xs text-gray-600">{d.age}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Income vs Expenses chart ─────────────────────────────────────────────────

function IncomeExpenseChart({
  income,
  expenses,
  surplus,
}: {
  income: number;
  expenses: number;
  surplus: number;
}) {
  const maxVal = Math.max(income, expenses, Math.abs(surplus), 1);
  const incomeH = Math.round((income / maxVal) * CHART_H);
  const expensesH = Math.round((expenses / maxVal) * CHART_H);
  const surplusH = Math.round((Math.abs(surplus) / maxVal) * CHART_H);
  const surplusPositive = surplus >= 0;

  return (
    <div className="flex items-end gap-6">
      <Bar height={incomeH} label="Income" value={fmt(income)} color="bg-emerald-500" />
      <Bar height={expensesH} label="Expenses" value={fmt(expenses)} color="bg-red-500" />
      <Bar
        height={surplusH}
        label={surplusPositive ? "Surplus" : "Shortfall"}
        value={fmt(Math.abs(surplus))}
        color={surplusPositive ? "bg-sky-500" : "bg-amber-500"}
      />
    </div>
  );
}

function Bar({ height, label, value, color }: { height: number; label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-gray-400 tabular-nums">{value}</span>
      <div className={`w-16 rounded-t ${color}`} style={{ height }} />
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}
