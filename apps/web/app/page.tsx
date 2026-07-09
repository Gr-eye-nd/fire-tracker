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

const CHART_H = 130;
const BAR_W = 14;
const BAR_GAP = 2;
const STEP = BAR_W + BAR_GAP;
const PRESERVATION_AGE = 60; // AU super preservation age

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [age, setAge] = useState(30);
  const [swr, setSwr] = useState(4);

  const [superBalance, setSuperBalance] = useState(80_000);
  const [superExtraConcessional, setSuperExtraConcessional] = useState(0);
  const [superNonConcessional, setSuperNonConcessional] = useState(0);
  const [superGrowthRate, setSuperGrowthRate] = useState(7);

  const [investBalance, setInvestBalance] = useState(50_000);
  const [cashBalance, setCashBalance] = useState(20_000);
  const [investContribution, setInvestContribution] = useState(20_000);
  const [investGrowthRate, setInvestGrowthRate] = useState(8);

  const [salary, setSalary] = useState(100_000);
  const [otherIncome, setOtherIncome] = useState(0);
  const [annualExpenses, setAnnualExpenses] = useState(60_000);

  // ── Derived values ────────────────────────────────────────────────────────────

  const swrDecimal = swr / 100;
  const superRate = superGrowthRate / 100;
  const investRate = investGrowthRate / 100;
  const blendedRate = (superRate + investRate) / 2;

  const tax = australianIncomeTax(salary, otherIncome);
  const sgAmount = employerSG(salary);
  const netIncome = tax.netIncome;
  const annualSurplus = netIncome - annualExpenses;

  const investNW = investBalance + cashBalance;
  const netWorth = superBalance + investNW;
  const target = calcFireNumber(annualExpenses, swrDecimal);

  // ── FI/RE age (derived, not an input) ─────────────────────────────────────────
  //
  // Two thresholds:
  //   investFire — investments outside super alone reach the target (accessible before 60)
  //   totalFire  — total net worth (incl. locked super) reaches the target
  //
  // effectiveFireAge: the age you can actually stop working.
  //   Use investFire when it exists — that's when you're truly free without needing super.
  //   Fall back to totalFire (requires staying until super accessible, or gap-bridging).

  const investFireResult = yearsToFire({
    currentNetWorth: investNW,
    annualSavings: investContribution,
    annualGrowthRate: investRate,
    annualExpenses,
    currentAge: age,
    safeWithdrawalRate: swrDecimal,
    maxYears: 60,
  });

  const totalFireResult = yearsToFire({
    currentNetWorth: netWorth,
    annualSavings: annualSurplus,
    annualGrowthRate: blendedRate,
    annualExpenses,
    currentAge: age,
    safeWithdrawalRate: swrDecimal,
    maxYears: 60,
  });

  const effectiveFireAge = investFireResult.fireAge ?? totalFireResult.fireAge ?? null;
  const retireBeforeSuper = effectiveFireAge !== null && effectiveFireAge < PRESERVATION_AGE;

  // Projection horizon: fire age + 5yr buffer for charts, or 40yr if never fires
  const FALLBACK_HORIZON = age + 40;
  const projectionEndAge = effectiveFireAge ?? FALLBACK_HORIZON;
  const workingYears = Math.max(projectionEndAge - age, 1);

  // ── Super — two-phase ──────────────────────────────────────────────────────────
  //
  // Phase 1: contributions continue while working (current age → min(fireAge, 60))
  //   SG is paid by employer; stops when you stop working.
  // Phase 2: balance grows untouched (fireAge → 60) if retiring before preservation age.

  const superPhase1EndAge = Math.min(projectionEndAge, PRESERVATION_AGE);
  const superPhase1 = superProjection({
    currentBalance: superBalance,
    currentAge: age,
    retirementAge: superPhase1EndAge,
    annualSalary: salary,
    extraConcessional: superExtraConcessional,
    nonConcessionalAnnual: superNonConcessional,
    annualGrowthRate: superRate,
  });

  const superPhase2Schedule =
    retireBeforeSuper && effectiveFireAge !== null
      ? compoundGrowthSchedule({
          principal: superPhase1.finalBalance,
          annualRate: superRate,
          years: PRESERVATION_AGE - effectiveFireAge,
          annualContribution: 0,
          currentAge: effectiveFireAge,
        })
      : [];

  const superAtAccess =
    superPhase2Schedule.length > 0
      ? (superPhase2Schedule[superPhase2Schedule.length - 1]?.balance ?? superPhase1.finalBalance)
      : superPhase1.finalBalance;

  const superCombinedSchedule = [...superPhase1.schedule, ...superPhase2Schedule];

  // ── Investments — grows until FI/RE ──────────────────────────────────────────

  const investSchedule = compoundGrowthSchedule({
    principal: investNW,
    annualRate: investRate,
    years: workingYears,
    annualContribution: investContribution,
    currentAge: age,
  });

  const investAtFire = investSchedule[investSchedule.length - 1]?.balance ?? investNW;

  // ── Drawdown — two-phase when retiring before super access ───────────────────
  //
  // Phase 1 (fireAge → 60): draw from investments only; super keeps growing untouched.
  // Phase 2 (60+):          draw from super + remaining investments combined.

  type DrawdownPoint = { age: number; value: number; depleted: boolean; phase: 1 | 2 };
  let drawdownData: DrawdownPoint[] = [];
  let drawdownLasts: number | null = null;

  if (retireBeforeSuper && effectiveFireAge !== null) {
    const yearsBeforeSuper = PRESERVATION_AGE - effectiveFireAge;

    const phase1 = drawdownSchedule({
      portfolioBalance: investAtFire,
      annualWithdrawal: annualExpenses,
      annualGrowthRate: investRate,
      inflationRate: 0.025,
      currentAge: effectiveFireAge,
      maxYears: yearsBeforeSuper,
    });

    if (phase1.portfolioLasts !== null) drawdownLasts = phase1.portfolioLasts;

    const investAt60 = Math.max(phase1.finalBalance, 0);
    const expensesAt60 =
      phase1.schedule[phase1.schedule.length - 1]?.inflationAdjustedWithdrawal ?? annualExpenses;

    const phase2 = drawdownSchedule({
      portfolioBalance: superAtAccess + investAt60,
      annualWithdrawal: expensesAt60,
      annualGrowthRate: blendedRate,
      inflationRate: 0.025,
      currentAge: PRESERVATION_AGE,
      maxYears: 40,
    });

    if (drawdownLasts === null && phase2.portfolioLasts !== null)
      drawdownLasts = phase2.portfolioLasts;

    drawdownData = [
      ...phase1.schedule.map((s) => ({ age: s.age, value: s.balance, depleted: s.depleted, phase: 1 as const })),
      ...phase2.schedule.map((s) => ({ age: s.age, value: s.balance, depleted: s.depleted, phase: 2 as const })),
    ];
  } else {
    const combined = drawdownSchedule({
      portfolioBalance: superAtAccess + investAtFire,
      annualWithdrawal: annualExpenses,
      annualGrowthRate: blendedRate,
      inflationRate: 0.025,
      currentAge: projectionEndAge,
      maxYears: 40,
    });
    drawdownLasts = combined.portfolioLasts;
    drawdownData = combined.schedule.map((s) => ({
      age: s.age, value: s.balance, depleted: s.depleted, phase: 2 as const,
    }));
  }

  // ── FI/RE progress chart data ──────────────────────────────────────────────

  const nwSchedule = compoundGrowthSchedule({
    principal: netWorth,
    annualRate: blendedRate,
    years: Math.max(projectionEndAge - age + 10, 30),
    annualContribution: annualSurplus,
    currentAge: age,
  });
  const fireBarIdx = nwSchedule.findIndex((s) => s.balance >= target);

  // ── Income/expense series (working years only) ─────────────────────────────

  const incExpSeries = Array.from({ length: workingYears }, (_, i) => {
    const inflatedExpenses = Math.round(annualExpenses * Math.pow(1.025, i));
    return {
      age: age + i + 1,
      income: netIncome,
      expenses: inflatedExpenses,
      surplus: netIncome - inflatedExpenses,
    };
  });

  // ── Retirement portfolio summary ───────────────────────────────────────────

  const retirementPortfolio = superAtAccess + investAtFire;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center gap-3">
        <span className="text-xl font-bold text-emerald-400">FI/RE</span>
        <span className="text-gray-500 text-sm">Financial Independence, Retire Early</span>
      </header>

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-49px)]">

        {/* ── Inputs ──────────────────────────────────────────────────────────── */}
        <aside className="lg:w-72 lg:min-w-72 bg-gray-900 border-r border-gray-800 p-4 space-y-5 overflow-y-auto text-sm">

          <Section title="Personal">
            <Slider label="Current age" value={age} onChange={setAge} min={18} max={75} display={String(age)} />
            <Slider label="Safe withdrawal rate" value={swr} onChange={setSwr} min={2} max={8} step={0.5} display={`${swr}%`} />
            <InfoRow label="FI/RE number" value={fmtK(target)} />
          </Section>

          <Section title="Superannuation">
            <Slider label="Current balance" value={superBalance} onChange={setSuperBalance} min={0} max={2_000_000} step={5_000} display={fmtK(superBalance)} />
            <Slider label="Extra concessional (salary sacrifice)" value={superExtraConcessional} onChange={setSuperExtraConcessional} min={0} max={27_500} step={500} display={fmt(superExtraConcessional)} note="Cap: $30k/yr incl. employer SG" />
            <Slider label="Non-concessional (after-tax)" value={superNonConcessional} onChange={setSuperNonConcessional} min={0} max={120_000} step={1_000} display={fmt(superNonConcessional)} note="Cap: $120k/yr" />
            <Slider label="Growth rate (p.a.)" value={superGrowthRate} onChange={setSuperGrowthRate} min={2} max={14} step={0.5} display={`${superGrowthRate}%`} />
            <InfoRow label="Employer SG (12%)" value={fmt(sgAmount)} note="Added on top of salary" />
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
            <div className="mt-2 bg-gray-800 rounded-lg p-3 space-y-1 text-xs">
              <div className="flex justify-between text-gray-400"><span>Gross income</span><span className="text-white">{fmt(tax.taxableIncome)}</span></div>
              <div className="flex justify-between text-gray-400"><span>Income tax</span><span className="text-red-400">−{fmt(tax.incomeTax)}</span></div>
              <div className="flex justify-between text-gray-400"><span>Medicare levy</span><span className="text-red-400">−{fmt(tax.medicareLevy)}</span></div>
              {tax.lito > 0 && <div className="flex justify-between text-gray-400"><span>LITO offset</span><span className="text-emerald-400">+{fmt(tax.lito)}</span></div>}
              <div className="flex justify-between font-semibold border-t border-gray-700 pt-1"><span className="text-gray-300">Net income</span><span className="text-white">{fmt(netIncome)}</span></div>
              <div className="flex justify-between text-gray-500"><span>Effective rate</span><span>{fmtPct(tax.effectiveRate)}</span></div>
            </div>
          </Section>

          <Section title="Expenses">
            <Slider label="Annual living expenses" value={annualExpenses} onChange={setAnnualExpenses} min={10_000} max={300_000} step={1_000} display={fmt(annualExpenses)} />
            <InfoRow label="Annual surplus (after tax)" value={fmt(annualSurplus)} good={annualSurplus > 0} bad={annualSurplus < 0} />
          </Section>
        </aside>

        {/* ── Dashboard ──────────────────────────────────────────────────────── */}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto">

          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Net worth" value={fmtK(netWorth)} />
            <Metric label="Annual surplus" value={fmt(annualSurplus)} good={annualSurplus > 0} bad={annualSurplus < 0} />
            <Metric label="FI/RE number" value={fmtK(target)} note={`${swr}% SWR`} />
            <Metric
              label="FI/RE age"
              value={effectiveFireAge !== null ? String(effectiveFireAge) : "Not reached"}
              good={effectiveFireAge !== null}
              note={effectiveFireAge !== null ? `In ${effectiveFireAge - age} years` : "Adjust inputs"}
            />
            <Metric
              label="Investments at FI/RE"
              value={fmtK(investAtFire)}
              note={effectiveFireAge !== null ? `Age ${effectiveFireAge}` : "—"}
            />
            <Metric
              label="Super at access (60)"
              value={fmtK(superAtAccess)}
              note={retireBeforeSuper ? "Grows untouched until 60" : `Age ${effectiveFireAge ?? "—"}`}
            />
            <Metric
              label="Retirement portfolio"
              value={fmtK(retirementPortfolio)}
              note="Investments + super combined"
            />
            <Metric
              label="Portfolio lasts"
              value={drawdownLasts ? `${drawdownLasts} yrs` : "40+ yrs"}
              good={drawdownLasts === null}
              note={drawdownLasts ? "May need adjustment" : "Sustainable"}
            />
          </div>

          {/* Super gap warning */}
          {retireBeforeSuper && effectiveFireAge !== null && (
            <div className="bg-amber-950/50 border border-amber-700/50 rounded-xl p-3 text-sm text-amber-300">
              <strong>Super access gap ({PRESERVATION_AGE - effectiveFireAge} years):</strong>{" "}
              FI/RE at {effectiveFireAge} but super is locked until {PRESERVATION_AGE}.
              Investments ({fmtK(investAtFire)}) must fund {fmt(annualExpenses)}/yr until then.
              At 60, super ({fmtK(superAtAccess)}) unlocks and joins the drawdown pool.
            </div>
          )}

          {/* FI/RE Progress */}
          <Chart
            title="FI/RE Progress"
            description={`Total net worth toward ${fmtK(target)} (${swr}% SWR of ${fmt(annualExpenses)}/yr expenses).${effectiveFireAge ? ` Crosses target at age ${effectiveFireAge} — bars turn green.` : ""}`}
          >
            <FireProgressChart
              data={nwSchedule.map((s) => ({ age: s.age, value: s.balance }))}
              target={target}
              fireBarIdx={fireBarIdx}
            />
          </Chart>

          {/* Income & Expenses */}
          <Chart
            title="Income & Expenses — Working Years"
            description={`After-tax income (${fmt(netIncome)}/yr, flat) vs inflation-adjusted expenses (2.5%/yr). Green = surplus shrinks as inflation grows expenses. Shown until FI/RE age ${effectiveFireAge ?? "—"}.`}
          >
            <IncExpChart data={incExpSeries} />
          </Chart>

          {/* Super */}
          <Chart
            title="Superannuation"
            description={
              retireBeforeSuper && effectiveFireAge !== null
                ? `Phase 1: contributions while working (age ${age}–${effectiveFireAge}). Phase 2: grows untouched at ${superGrowthRate}% until access at 60 → ${fmtK(superAtAccess)}.`
                : `Balance grows from ${fmtK(superBalance)} → ${fmtK(superAtAccess)} at FI/RE (age ${effectiveFireAge ?? "—"}). Includes SG + extra contributions, 15% contributions tax.`
            }
          >
            <SuperChart
              data={superCombinedSchedule.map((s) => ({ age: s.age, value: s.balance }))}
              phase2StartAge={retireBeforeSuper && effectiveFireAge !== null ? effectiveFireAge : null}
            />
          </Chart>

          {/* Investments */}
          <Chart
            title="Investments Outside Super"
            description={`Portfolio from ${fmtK(investNW)} at ${investGrowthRate}% p.a. with ${fmt(investContribution)}/yr contributions → ${fmtK(investAtFire)} at FI/RE age ${effectiveFireAge ?? "—"}. Accessible at any age.`}
          >
            <BarChart data={investSchedule.map((s) => ({ age: s.age, value: s.balance }))} color="sky" />
          </Chart>

          {/* Drawdown */}
          <Chart
            title="Retirement Drawdown"
            description={
              retireBeforeSuper && effectiveFireAge !== null
                ? `Sky = investments only (age ${effectiveFireAge}–60, ${fmt(annualExpenses)}/yr). Violet = super + investments combined from 60 (${fmtK(superAtAccess + 0)} unlocks). ${drawdownLasts ? `Portfolio depleted at year ${drawdownLasts}.` : "Survives 40 years."}`
                : `Starting ${fmtK(retirementPortfolio)} at age ${projectionEndAge}, withdrawing ${fmt(annualExpenses)}/yr inflation-adjusted. ${drawdownLasts ? `Depleted at year ${drawdownLasts}.` : "Survives 40 years."}`
            }
          >
            <DrawdownChart data={drawdownData} superUnlockAge={retireBeforeSuper ? PRESERVATION_AGE : null} />
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

function Slider({ label, value, onChange, min, max, step = 1, display, note }: {
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

function InfoRow({ label, value, note, good, bad }: {
  label: string; value: string; note?: string; good?: boolean; bad?: boolean;
}) {
  const color = good ? "text-emerald-400" : bad ? "text-amber-400" : "text-gray-300";
  return (
    <div className="flex justify-between items-baseline py-0.5">
      <span className="text-gray-500 text-xs">{label}{note && <span className="text-gray-600 ml-1">· {note}</span>}</span>
      <span className={`text-xs font-semibold tabular-nums ${color}`}>{value}</span>
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

function Chart({ title, description, children }: {
  title: string; description: string; children: React.ReactNode;
}) {
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
          return (
            <div key={i} title={`Age ${d.age}: ${fmt(d.value)}`}
              className={`flex-shrink-0 rounded-sm transition-colors cursor-pointer ${d.depleted ? "bg-red-700 hover:bg-red-500" : `${bar} hover:${hover}`}`}
              style={{ width: BAR_W, height: h }} />
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

// ─── Super chart (phase 1 = emerald with contributions, phase 2 = teal growth-only) ──

function SuperChart({ data, phase2StartAge }: {
  data: { age: number; value: number }[];
  phase2StartAge: number | null;
}) {
  if (!data.length) return <p className="text-gray-600 text-xs">No data</p>;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));

  return (
    <div className="overflow-x-auto">
      {phase2StartAge !== null && (
        <div className="flex gap-4 mb-2 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-600" /> With contributions</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-teal-600" /> Growth only (locked)</span>
        </div>
      )}
      <div className="flex items-end min-w-max" style={{ height: CHART_H, gap: BAR_GAP }}>
        {data.map((d, i) => {
          const h = Math.max(Math.round((d.value / maxVal) * CHART_H), 2);
          const isPhase2 = phase2StartAge !== null && d.age > phase2StartAge;
          return (
            <div key={i} title={`Age ${d.age}: ${fmt(d.value)}${isPhase2 ? " (locked, growing)" : ""}`}
              className={`flex-shrink-0 rounded-sm transition-colors cursor-pointer ${isPhase2 ? "bg-teal-600 hover:bg-teal-400" : "bg-emerald-600 hover:bg-emerald-400"}`}
              style={{ width: BAR_W, height: h }} />
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
        {/* Threshold dashed line */}
        <div className="absolute left-0 right-0 border-t border-dashed border-emerald-500/50 pointer-events-none"
          style={{ bottom: thresholdH + 20 }} />
        {/* FI/RE marker */}
        {markerLeft >= 0 && (
          <div className="absolute bottom-5 top-0 w-px bg-emerald-400/80 pointer-events-none"
            style={{ left: markerLeft }}>
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
              <div key={i} title={`Age ${d.age}: ${fmt(d.value)}`}
                className={`flex-shrink-0 rounded-sm transition-colors cursor-pointer ${reached ? "bg-emerald-500 hover:bg-emerald-300" : "bg-gray-600 hover:bg-gray-400"}`}
                style={{ width: BAR_W, height: h }} />
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

// ─── Drawdown chart (sky = investments-only phase, violet = combined phase) ───

function DrawdownChart({ data, superUnlockAge }: {
  data: { age: number; value: number; depleted: boolean; phase: 1 | 2 }[];
  superUnlockAge: number | null;
}) {
  if (!data.length) return <p className="text-gray-600 text-xs">No data</p>;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));
  const unlockIdx = superUnlockAge !== null ? data.findIndex((d) => d.age >= superUnlockAge) : -1;
  const unlockLeft = unlockIdx >= 0 ? unlockIdx * STEP + Math.floor(BAR_W / 2) : -1;

  return (
    <div className="overflow-x-auto">
      {superUnlockAge !== null && (
        <div className="flex gap-4 mb-2 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-600" /> Investments only</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-violet-600" /> Super + investments</span>
        </div>
      )}
      <div className="relative min-w-max" style={{ height: CHART_H + (superUnlockAge ? 16 : 0) }}>
        {/* Super unlock marker */}
        {unlockLeft >= 0 && (
          <div className="absolute bottom-5 top-0 w-px bg-teal-400/70 pointer-events-none"
            style={{ left: unlockLeft }}>
            <span className="absolute -top-1 left-2 text-xs text-teal-400 whitespace-nowrap">Super unlocks {superUnlockAge}</span>
          </div>
        )}
        <div className="absolute bottom-5 left-0 flex items-end min-w-max" style={{ gap: BAR_GAP }}>
          {data.map((d, i) => {
            const h = Math.max(Math.round((d.value / maxVal) * CHART_H), 2);
            const cls = d.depleted
              ? "bg-red-700 hover:bg-red-500"
              : d.phase === 1
              ? "bg-sky-600 hover:bg-sky-400"
              : "bg-violet-600 hover:bg-violet-400";
            return (
              <div key={i} title={`Age ${d.age}: ${fmt(d.value)}${d.phase === 1 ? " (investments)" : " (combined)"}`}
                className={`flex-shrink-0 rounded-sm transition-colors cursor-pointer ${cls}`}
                style={{ width: BAR_W, height: h }} />
            );
          })}
        </div>
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

// ─── Income & Expenses stacked chart ──────────────────────────────────────────

function IncExpChart({ data }: {
  data: { age: number; income: number; expenses: number; surplus: number }[];
}) {
  if (!data.length) return <p className="text-gray-600 text-xs">No data</p>;
  const maxVal = Math.max(...data.map((d) => Math.max(d.income, d.expenses)), 1);
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));

  return (
    <div className="overflow-x-auto">
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
          const expDrawH = Math.min(expH, incH);
          const surplusH = deficit ? 0 : incH - expDrawH;
          const deficitH = deficit ? expH - incH : 0;

          return (
            <div key={i} className="flex-shrink-0 flex flex-col" style={{ width: BAR_W }}
              title={`Age ${d.age} — Net income: ${fmt(d.income)}, Expenses: ${fmt(d.expenses)}, ${deficit ? "Shortfall" : "Surplus"}: ${fmt(Math.abs(d.surplus))}`}>
              {deficitH > 0 && <div className="w-full bg-amber-500 hover:bg-amber-400 transition-colors cursor-pointer rounded-t-sm" style={{ height: deficitH }} />}
              {surplusH > 0 && <div className="w-full bg-emerald-600 hover:bg-emerald-400 transition-colors cursor-pointer" style={{ height: surplusH }} />}
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
