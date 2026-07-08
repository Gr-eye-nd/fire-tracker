"use client";

import { useState } from "react";
import {
  superProjection,
  compoundGrowthSchedule,
  drawdownSchedule,
  yearsToFire,
  fireNumber as calcFireNumber,
  australianIncomeTax,
  employerSG,
} from "@/lib/calc-engine";

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

const fmtK = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1_000).toFixed(0)}K`;

const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

// ─── Chart config ─────────────────────────────────────────────────────────────

const CHART_H = 130; // px
const BAR_W = 14;    // px
const BAR_GAP = 2;   // px
const STEP = BAR_W + BAR_GAP;

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Home() {
  // Personal
  const [age, setAge] = useState(30);
  const [retirementAge, setRetirementAge] = useState(65);
  const [swr, setSwr] = useState(4);

  // Super
  const [superBalance, setSuperBalance] = useState(80_000);
  const [superExtraConcessional, setSuperExtraConcessional] = useState(0);
  const [superNonConcessional, setSuperNonConcessional] = useState(0);
  const [superGrowthRate, setSuperGrowthRate] = useState(7);

  // Investments outside super
  const [investBalance, setInvestBalance] = useState(50_000);
  const [cashBalance, setCashBalance] = useState(20_000);
  const [investContribution, setInvestContribution] = useState(20_000);
  const [investGrowthRate, setInvestGrowthRate] = useState(8);

  // Income
  const [salary, setSalary] = useState(100_000);
  const [otherIncome, setOtherIncome] = useState(0);

  // Expenses
  const [annualExpenses, setAnnualExpenses] = useState(60_000);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const yearsToRetire = Math.max(retirementAge - age, 1);
  const swrDecimal = swr / 100;
  const superRate = superGrowthRate / 100;
  const investRate = investGrowthRate / 100;
  const blendedRate = (superRate + investRate) / 2;

  // Tax
  const tax = australianIncomeTax(salary, otherIncome);
  const sgAmount = employerSG(salary);
  const netIncome = tax.netIncome;
  const annualSurplus = netIncome - annualExpenses;

  // Net worth
  const investNW = investBalance + cashBalance;
  const netWorth = superBalance + investNW;

  // FI/RE targets
  const target = calcFireNumber(annualExpenses, swrDecimal);

  // Total FI/RE (ALL assets incl. super — may not be accessible before 60)
  const totalFireResult = yearsToFire({
    currentNetWorth: netWorth,
    annualSavings: annualSurplus,
    annualGrowthRate: blendedRate,
    annualExpenses,
    currentAge: age,
    safeWithdrawalRate: swrDecimal,
    maxYears: 60,
  });

  // Investments-only FI/RE (accessible now — excludes super which is locked until 60)
  const investFireResult = yearsToFire({
    currentNetWorth: investNW,
    annualSavings: investContribution,
    annualGrowthRate: investRate,
    annualExpenses,
    currentAge: age,
    safeWithdrawalRate: swrDecimal,
    maxYears: 60,
  });

  const superLocked = (totalFireResult.fireAge ?? 100) < 60;

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
    principal: investNW,
    annualRate: investRate,
    years: yearsToRetire,
    annualContribution: investContribution,
    currentAge: age,
  });

  // Net worth projection to retirement + 10yr (for FI/RE progress chart)
  const nwSchedule = compoundGrowthSchedule({
    principal: netWorth,
    annualRate: blendedRate,
    years: Math.max(yearsToRetire + 10, 30),
    annualContribution: annualSurplus,
    currentAge: age,
  });
  const fireBarIdx = nwSchedule.findIndex((s) => s.balance >= target);

  // Retirement drawdown
  const retirementPortfolio =
    superResult.finalBalance + (investSchedule[investSchedule.length - 1]?.balance ?? investNW);
  const drawResult = drawdownSchedule({
    portfolioBalance: retirementPortfolio,
    annualWithdrawal: annualExpenses,
    annualGrowthRate: blendedRate,
    inflationRate: 0.025,
    currentAge: retirementAge,
    maxYears: 40,
  });

  // Income & expenses time series (current age → retirement, inflation-adjusted expenses)
  const incExpSeries = Array.from({ length: yearsToRetire }, (_, i) => {
    const inflatedExpenses = Math.round(annualExpenses * Math.pow(1.025, i));
    return {
      age: age + i + 1,
      income: netIncome,
      expenses: inflatedExpenses,
      surplus: netIncome - inflatedExpenses,
    };
  });

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center gap-3">
        <span className="text-xl font-bold text-emerald-400">FI/RE</span>
        <span className="text-gray-500 text-sm">Financial Independence, Retire Early</span>
      </header>

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-49px)]">
        {/* ── Inputs ──────────────────────────────────────────────────────── */}
        <aside className="lg:w-72 lg:min-w-72 bg-gray-900 border-r border-gray-800 p-4 space-y-5 overflow-y-auto text-sm">

          <Section title="Personal">
            <Slider label="Current age" value={age} onChange={setAge} min={18} max={75} display={String(age)} />
            <Slider label="Retirement age" value={retirementAge} onChange={setRetirementAge} min={age + 1} max={90} display={String(retirementAge)} />
            <Slider label="Safe withdrawal rate" value={swr} onChange={setSwr} min={2} max={8} step={0.5} display={`${swr}%`} />
          </Section>

          <Section title="Superannuation">
            <Slider label="Current balance" value={superBalance} onChange={setSuperBalance} min={0} max={2_000_000} step={5_000} display={fmtK(superBalance)} />
            <Slider label="Extra concessional (salary sacrifice)" value={superExtraConcessional} onChange={setSuperExtraConcessional} min={0} max={27_500} step={500} display={fmt(superExtraConcessional)} note="Cap: $30k/yr incl. employer SG" />
            <Slider label="Non-concessional (after-tax)" value={superNonConcessional} onChange={setSuperNonConcessional} min={0} max={120_000} step={1_000} display={fmt(superNonConcessional)} note="Cap: $120k/yr" />
            <Slider label="Growth rate (p.a.)" value={superGrowthRate} onChange={setSuperGrowthRate} min={2} max={14} step={0.5} display={`${superGrowthRate}%`} />
            <InfoRow label="Employer SG (12%)" value={fmt(sgAmount)} note="Paid on top of salary → super" />
          </Section>

          <Section title="Investments outside super">
            <Slider label="Portfolio balance" value={investBalance} onChange={setInvestBalance} min={0} max={3_000_000} step={5_000} display={fmtK(investBalance)} />
            <Slider label="Cash / savings" value={cashBalance} onChange={setCashBalance} min={0} max={500_000} step={1_000} display={fmtK(cashBalance)} />
            <Slider label="Annual contributions" value={investContribution} onChange={setInvestContribution} min={0} max={200_000} step={1_000} display={fmt(investContribution)} />
            <Slider label="Growth rate (p.a.)" value={investGrowthRate} onChange={setInvestGrowthRate} min={2} max={20} step={0.5} display={`${investGrowthRate}%`} />
          </Section>

          <Section title="Income">
            <Slider label="Salary (gross)" value={salary} onChange={setSalary} min={0} max={500_000} step={5_000} display={fmtK(salary)} />
            <Slider label="Other income" value={otherIncome} onChange={setOtherIncome} min={0} max={200_000} step={1_000} display={fmt(otherIncome)} note="Dividends, rent, side income" />
            {/* Tax breakdown */}
            <div className="mt-2 bg-gray-800 rounded-lg p-3 space-y-1 text-xs">
              <div className="flex justify-between text-gray-400">
                <span>Gross income</span><span className="text-white">{fmt(tax.taxableIncome)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Income tax</span><span className="text-red-400">-{fmt(tax.incomeTax)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Medicare levy</span><span className="text-red-400">-{fmt(tax.medicareLevy)}</span>
              </div>
              {tax.lito > 0 && (
                <div className="flex justify-between text-gray-400">
                  <span>LITO offset</span><span className="text-emerald-400">+{fmt(tax.lito)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t border-gray-700 pt-1 mt-1">
                <span className="text-gray-300">Net income</span><span className="text-white">{fmt(netIncome)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Effective rate</span><span>{fmtPct(tax.effectiveRate)}</span>
              </div>
            </div>
          </Section>

          <Section title="Expenses">
            <Slider label="Annual living expenses" value={annualExpenses} onChange={setAnnualExpenses} min={10_000} max={300_000} step={1_000} display={fmt(annualExpenses)} />
            <InfoRow label="Annual surplus" value={fmt(annualSurplus)} good={annualSurplus > 0} />
          </Section>
        </aside>

        {/* ── Dashboard ───────────────────────────────────────────────────── */}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto">

          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Net worth" value={fmtK(netWorth)} />
            <Metric label="Annual surplus" value={fmt(annualSurplus)} good={annualSurplus > 0} bad={annualSurplus < 0} />
            <Metric label="FI/RE number" value={fmtK(target)} note={`${swr}% SWR`} />
            <Metric
              label="Total FI/RE age"
              value={totalFireResult.fireAge !== null ? String(totalFireResult.fireAge) : "60+ yrs"}
              good={totalFireResult.fireAge !== null && totalFireResult.fireAge <= retirementAge}
              note="Incl. super"
            />
            <Metric
              label="Investments FI/RE age"
              value={investFireResult.fireAge !== null ? String(investFireResult.fireAge) : "60+ yrs"}
              good={investFireResult.fireAge !== null && investFireResult.fireAge <= retirementAge}
              note="Excl. super (accessible now)"
            />
            <Metric label="Super at retirement" value={fmtK(superResult.finalBalance)} note={`Age ${retirementAge}`} />
            <Metric label="Retirement portfolio" value={fmtK(retirementPortfolio)} note="Super + investments" />
            <Metric
              label="Portfolio lasts"
              value={drawResult.portfolioLasts ? `${drawResult.portfolioLasts} yrs` : "40+ yrs"}
              good={drawResult.portfolioLasts === null}
            />
          </div>

          {/* Super gap warning */}
          {superLocked && totalFireResult.fireAge !== null && (
            <div className="bg-amber-950/50 border border-amber-700/50 rounded-xl p-3 text-sm text-amber-300">
              <strong>Super access gap:</strong> Total FI/RE at {totalFireResult.fireAge} includes ${fmtK(superBalance)} super that can&apos;t be accessed until age 60. Your investments outside super ({fmtK(investNW)}) need to fund {fmt(annualExpenses)}/yr for {60 - totalFireResult.fireAge} years before super unlocks. Investments-only FI/RE age gives a more realistic early-retirement target.
            </div>
          )}

          {/* FI/RE Progress */}
          <Chart
            title="FI/RE Progress"
            description={`Total net worth growing toward ${fmtK(target)} (${swr}% SWR). Bars turn green once threshold is crossed.${totalFireResult.fireAge ? ` Reached at age ${totalFireResult.fireAge}.` : ""}`}
          >
            <FireProgressChart
              data={nwSchedule.map((s) => ({ age: s.age, value: s.balance }))}
              target={target}
              fireBarIdx={fireBarIdx}
            />
          </Chart>

          {/* Income & Expenses */}
          <Chart
            title="Income & Expenses by Age"
            description={`Net income (${fmt(netIncome)}/yr after tax) vs inflation-adjusted expenses (2.5%/yr). Green = surplus, red = expenses, amber = shortfall.`}
          >
            <IncExpChart data={incExpSeries} />
          </Chart>

          {/* Super */}
          <Chart
            title="Superannuation Projection"
            description={`Balance from ${fmtK(superBalance)} → ~${fmtK(superResult.finalBalance)} at age ${retirementAge}. Includes employer SG (${fmt(sgAmount)}/yr), extra contributions, 15% contributions tax.`}
          >
            <BarChart data={superResult.schedule.map((s) => ({ age: s.age, value: s.balance }))} color="emerald" />
          </Chart>

          {/* Investments */}
          <Chart
            title="Investments Outside Super"
            description={`Portfolio from ${fmtK(investNW)} growing at ${investGrowthRate}% p.a. with ${fmt(investContribution)}/yr contributions. Accessible at any age.`}
          >
            <BarChart data={investSchedule.map((s) => ({ age: s.age, value: s.balance }))} color="sky" />
          </Chart>

          {/* Drawdown */}
          <Chart
            title="Retirement Drawdown"
            description={`Starting ${fmtK(retirementPortfolio)} at age ${retirementAge}. Withdrawing ${fmt(annualExpenses)}/yr inflation-adjusted (2.5%/yr). ${drawResult.portfolioLasts ? `Depleted at year ${drawResult.portfolioLasts}.` : "Survives 40 years."}`}
          >
            <BarChart data={drawResult.schedule.map((s) => ({ age: s.age, value: s.balance, depleted: s.depleted }))} color="violet" />
          </Chart>
        </div>
      </div>
    </main>
  );
}

// ─── Input components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-emerald-500 uppercase tracking-widest mb-3">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Slider({
  label, value, onChange, min, max, step = 1, display, note,
}: {
  label: string; value: number; onChange: (n: number) => void;
  min: number; max: number; step?: number; display: string; note?: string;
}) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-gray-400 text-xs">{label}</span>
        <span className="text-white text-xs font-semibold tabular-nums">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-emerald-500 cursor-pointer" />
      {note && <p className="text-gray-600 text-xs mt-0.5">{note}</p>}
    </div>
  );
}

function InfoRow({ label, value, note, good }: { label: string; value: string; note?: string; good?: boolean }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-gray-500 text-xs">{label}{note && <span className="text-gray-600 ml-1">· {note}</span>}</span>
      <span className={`text-xs font-semibold tabular-nums ${good === true ? "text-emerald-400" : good === false ? "text-amber-400" : "text-gray-300"}`}>{value}</span>
    </div>
  );
}

// ─── Metric card ─────────────────────────────────────────────────────────────

function Metric({ label, value, good, bad, note }: {
  label: string; value: string; good?: boolean; bad?: boolean; note?: string;
}) {
  const color = good ? "text-emerald-400" : bad ? "text-amber-400" : "text-white";
  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
      {note && <p className="text-xs text-gray-600 mt-0.5">{note}</p>}
    </div>
  );
}

// ─── Chart wrapper ────────────────────────────────────────────────────────────

function Chart({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-gray-500 mt-0.5 mb-3 leading-relaxed">{description}</p>
      {children}
    </div>
  );
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

const colorMap: Record<string, { bar: string; hover: string }> = {
  emerald: { bar: "bg-emerald-600", hover: "bg-emerald-400" },
  sky:     { bar: "bg-sky-600",     hover: "bg-sky-400" },
  violet:  { bar: "bg-violet-600",  hover: "bg-violet-400" },
};

function BarChart({ data, color }: {
  data: { age: number; value: number; depleted?: boolean }[];
  color: keyof typeof colorMap;
}) {
  if (!data.length) return <p className="text-gray-600 text-xs">No data</p>;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const { bar, hover } = colorMap[color] ?? colorMap.emerald;
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end min-w-max" style={{ height: CHART_H, gap: BAR_GAP }}>
        {data.map((d, i) => {
          const h = Math.max(Math.round((d.value / maxVal) * CHART_H), 2);
          const base = d.depleted ? "bg-red-700" : bar;
          const hov = d.depleted ? "bg-red-500" : hover;
          return (
            <div
              key={i}
              title={`Age ${d.age}: ${fmt(d.value)}`}
              className={`flex-shrink-0 rounded-sm ${base} hover:${hov} transition-colors cursor-pointer`}
              style={{ width: BAR_W, height: h }}
            />
          );
        })}
      </div>
      <div className="flex min-w-max mt-1" style={{ gap: BAR_GAP }}>
        {data.map((d, i) => (
          <div key={i} className="flex-shrink-0 text-center" style={{ width: BAR_W }}>
            {i % labelEvery === 0 && <span className="text-xs text-gray-600">{d.age}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── FI/RE progress chart ─────────────────────────────────────────────────────

function FireProgressChart({ data, target, fireBarIdx }: {
  data: { age: number; value: number }[];
  target: number;
  fireBarIdx: number;
}) {
  if (!data.length) return <p className="text-gray-600 text-xs">No data</p>;

  const maxVal = Math.max(...data.map((d) => d.value), target * 1.05);
  const thresholdH = Math.round((target / maxVal) * CHART_H);
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));
  const markerLeft = fireBarIdx >= 0 ? fireBarIdx * STEP + Math.floor(BAR_W / 2) : -1;

  return (
    <div className="overflow-x-auto">
      <div className="relative min-w-max" style={{ height: CHART_H + 20 }}>
        {/* Threshold line */}
        <div
          className="absolute left-0 right-0 border-t border-dashed border-emerald-500/50 pointer-events-none"
          style={{ bottom: thresholdH + 20 }}
        />
        {/* FI/RE age marker */}
        {markerLeft >= 0 && (
          <div
            className="absolute bottom-5 top-0 w-px bg-emerald-400/70 pointer-events-none"
            style={{ left: markerLeft }}
          >
            <span className="absolute -top-1 left-2 text-xs text-emerald-400 whitespace-nowrap font-semibold">
              FI/RE age {data[fireBarIdx]?.age}
            </span>
          </div>
        )}
        {/* Bars */}
        <div className="absolute bottom-5 left-0 flex items-end min-w-max" style={{ gap: BAR_GAP }}>
          {data.map((d, i) => {
            const h = Math.max(Math.round((d.value / maxVal) * CHART_H), 2);
            const reached = fireBarIdx >= 0 && i >= fireBarIdx;
            return (
              <div
                key={i}
                title={`Age ${d.age}: ${fmt(d.value)}`}
                className={`flex-shrink-0 rounded-sm transition-colors cursor-pointer ${
                  reached
                    ? "bg-emerald-500 hover:bg-emerald-300"
                    : "bg-gray-600 hover:bg-gray-400"
                }`}
                style={{ width: BAR_W, height: h }}
              />
            );
          })}
        </div>
        {/* Age labels */}
        <div className="absolute bottom-0 left-0 flex min-w-max" style={{ gap: BAR_GAP }}>
          {data.map((d, i) => (
            <div key={i} className="flex-shrink-0 text-center" style={{ width: BAR_W }}>
              {i % labelEvery === 0 && <span className="text-xs text-gray-600">{d.age}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Income & Expenses by age (stacked) ──────────────────────────────────────

function IncExpChart({ data }: {
  data: { age: number; income: number; expenses: number; surplus: number }[];
}) {
  if (!data.length) return <p className="text-gray-600 text-xs">No data</p>;

  const maxVal = Math.max(...data.map((d) => Math.max(d.income, d.expenses)), 1);
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));

  return (
    <div className="overflow-x-auto">
      {/* Legend */}
      <div className="flex gap-4 mb-2 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-600" /> Surplus</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-600" /> Expenses</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500" /> Shortfall</span>
      </div>

      <div className="flex items-end min-w-max" style={{ height: CHART_H, gap: BAR_GAP }}>
        {data.map((d, i) => {
          const incH = Math.round((d.income / maxVal) * CHART_H);
          const expH = Math.round((d.expenses / maxVal) * CHART_H);
          const deficit = d.surplus < 0;

          // Stacked: expenses (red) at bottom, surplus (green) above
          // If deficit: expenses fill to income, amber above
          const expDrawH = Math.min(expH, incH);
          const surplusH = deficit ? 0 : incH - expDrawH;
          const deficitH = deficit ? expH - incH : 0;

          return (
            <div
              key={i}
              className="flex-shrink-0 flex flex-col"
              style={{ width: BAR_W }}
              title={`Age ${d.age} — Income: ${fmt(d.income)}, Expenses: ${fmt(d.expenses)}, ${deficit ? "Shortfall" : "Surplus"}: ${fmt(Math.abs(d.surplus))}`}
            >
              {deficitH > 0 && (
                <div className="w-full bg-amber-500 hover:bg-amber-400 transition-colors cursor-pointer rounded-t-sm" style={{ height: deficitH }} />
              )}
              {surplusH > 0 && (
                <div className="w-full bg-emerald-600 hover:bg-emerald-400 transition-colors cursor-pointer" style={{ height: surplusH }} />
              )}
              <div className="w-full bg-red-600 hover:bg-red-400 transition-colors cursor-pointer rounded-b-sm" style={{ height: Math.max(expDrawH, 2) }} />
            </div>
          );
        })}
      </div>

      <div className="flex min-w-max mt-1" style={{ gap: BAR_GAP }}>
        {data.map((d, i) => (
          <div key={i} className="flex-shrink-0 text-center" style={{ width: BAR_W }}>
            {i % labelEvery === 0 && <span className="text-xs text-gray-600">{d.age}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
