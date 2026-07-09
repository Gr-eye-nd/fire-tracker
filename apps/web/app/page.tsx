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

// ─── Chart constants ──────────────────────────────────────────────────────────

const CHART_H = 160;
const BAR_W = 14;
const BAR_GAP = 2;
const STEP = BAR_W + BAR_GAP;

// ─── Types ────────────────────────────────────────────────────────────────────

type SuperPoint = { age: number; value: number; phase: 1 | 2 | 3 };
type IncomePoint = { age: number; workingIncome: number; investIncome: number; superIncome: number; expenses: number };
type InvestPhase = "grow" | "drawdown-invest" | "drawdown-combined";
type InvestPoint = { age: number; balance: number; principalPortion: number; phase: InvestPhase };
type DrawdownPoint = { age: number; value: number; depleted: boolean; phase: 1 | 2 };
type CandleRaw = { age: number; remaining: number; withdrawn: number; depleted: boolean; phase: 1 | 2 };
type CandlePoint = CandleRaw & { investPortion: number; superPortion: number };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [age, setAge] = useState(30);
  const [swr, setSwr] = useState(4);
  const [superAccessAge, setSuperAccessAge] = useState(60);

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

  // ── Derived ───────────────────────────────────────────────────────────────────

  const swrDecimal = swr / 100;
  const superRate = superGrowthRate / 100;
  const investRate = investGrowthRate / 100;
  const blendedRate = (superRate + investRate) / 2;

  const tax = australianIncomeTax(salary, otherIncome);
  const sgAmount = employerSG(salary);
  const netIncome = tax.netIncome;
  const annualSurplus = netIncome - annualExpenses;
  const monthlyExpenses = Math.round(annualExpenses / 12);
  const weeklyExpenses = Math.round(annualExpenses / 52);
  const expenseToIncomeRatio = netIncome > 0 ? annualExpenses / netIncome : 1;

  const investNW = investBalance + cashBalance;
  const netWorth = superBalance + investNW;
  const target = calcFireNumber(annualExpenses, swrDecimal);

  // ── FI/RE age (invest-only — super excluded until access age) ─────────────────

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
  const retireBeforeSuper = effectiveFireAge !== null && effectiveFireAge < superAccessAge;

  const FALLBACK_HORIZON = age + 40;
  const projectionEndAge = effectiveFireAge ?? FALLBACK_HORIZON;
  const workingYears = Math.max(projectionEndAge - age, 1);

  // ── Super — two-phase accumulation ────────────────────────────────────────────

  const superPhase1EndAge = Math.min(projectionEndAge, superAccessAge);
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
          years: superAccessAge - effectiveFireAge,
          annualContribution: 0,
          currentAge: effectiveFireAge,
        })
      : [];

  const superAtAccess =
    superPhase2Schedule.length > 0
      ? (superPhase2Schedule[superPhase2Schedule.length - 1]?.balance ?? superPhase1.finalBalance)
      : superPhase1.finalBalance;

  const superCombinedSchedule = [...superPhase1.schedule, ...superPhase2Schedule];

  // ── Investments — growth to fireAge ───────────────────────────────────────────

  const investSchedule = compoundGrowthSchedule({
    principal: investNW,
    annualRate: investRate,
    years: workingYears,
    annualContribution: investContribution,
    currentAge: age,
  });

  const investAtFire = investSchedule[investSchedule.length - 1]?.balance ?? investNW;

  // ── Drawdown — two phases to age 100; also build candleRaw for candle chart ───

  let drawdownData: DrawdownPoint[] = [];
  let drawdownLasts: number | null = null;
  let phase1FinalBalance = investAtFire;
  let expensesAtSuperAccess = annualExpenses;
  const candleRaw: CandleRaw[] = [];

  if (retireBeforeSuper && effectiveFireAge !== null) {
    const yearsBeforeSuper = superAccessAge - effectiveFireAge;

    const phase1 = drawdownSchedule({
      portfolioBalance: investAtFire,
      annualWithdrawal: annualExpenses,
      annualGrowthRate: investRate,
      inflationRate: 0.025,
      currentAge: effectiveFireAge,
      maxYears: yearsBeforeSuper,
    });

    phase1FinalBalance = Math.max(phase1.finalBalance, 0);
    expensesAtSuperAccess =
      phase1.schedule[phase1.schedule.length - 1]?.inflationAdjustedWithdrawal ?? annualExpenses;

    if (phase1.portfolioLasts !== null) drawdownLasts = phase1.portfolioLasts;

    const phase2 = drawdownSchedule({
      portfolioBalance: superAtAccess + phase1FinalBalance,
      annualWithdrawal: expensesAtSuperAccess,
      annualGrowthRate: blendedRate,
      inflationRate: 0.025,
      currentAge: superAccessAge,
      maxYears: 100 - superAccessAge,
    });

    if (drawdownLasts === null && phase2.portfolioLasts !== null)
      drawdownLasts = phase2.portfolioLasts;

    drawdownData = [
      ...phase1.schedule.map((s) => ({ age: s.age, value: s.balance, depleted: s.depleted, phase: 1 as const })),
      ...phase2.schedule.map((s) => ({ age: s.age, value: s.balance, depleted: s.depleted, phase: 2 as const })),
    ];

    for (const s of phase1.schedule)
      candleRaw.push({ age: s.age, remaining: s.balance, withdrawn: s.withdrawal, depleted: s.depleted, phase: 1 });
    for (const s of phase2.schedule)
      candleRaw.push({ age: s.age, remaining: s.balance, withdrawn: s.withdrawal, depleted: s.depleted, phase: 2 });
  } else {
    const combined = drawdownSchedule({
      portfolioBalance: superAtAccess + investAtFire,
      annualWithdrawal: annualExpenses,
      annualGrowthRate: blendedRate,
      inflationRate: 0.025,
      currentAge: projectionEndAge,
      maxYears: 100 - projectionEndAge,
    });
    drawdownLasts = combined.portfolioLasts;
    drawdownData = combined.schedule.map((s) => ({
      age: s.age, value: s.balance, depleted: s.depleted, phase: 2 as const,
    }));
    for (const s of combined.schedule)
      candleRaw.push({ age: s.age, remaining: s.balance, withdrawn: s.withdrawal, depleted: s.depleted, phase: 2 });
  }

  const drawdownTo80 = drawdownData.filter((d) => d.age <= 80);
  const drawdownFrom80 = drawdownData.filter((d) => d.age >= 80);

  // ── Investment journey to age 80 (stacked bars) ───────────────────────────────

  const investJourney: InvestPoint[] = [];

  for (const s of investSchedule) {
    const principalPortion = Math.min(investNW + s.cumulativeContributions, s.balance);
    investJourney.push({ age: s.age, balance: s.balance, principalPortion, phase: "grow" });
  }

  if (retireBeforeSuper && effectiveFireAge !== null) {
    const yearsBeforeSuper = superAccessAge - effectiveFireAge;
    const phase1Draw = drawdownSchedule({
      portfolioBalance: investAtFire,
      annualWithdrawal: annualExpenses,
      annualGrowthRate: investRate,
      inflationRate: 0.025,
      currentAge: effectiveFireAge,
      maxYears: yearsBeforeSuper,
    });
    for (const s of phase1Draw.schedule)
      investJourney.push({ age: s.age, balance: s.balance, principalPortion: s.balance, phase: "drawdown-invest" });
  }

  const superAccessStartAge = retireBeforeSuper ? superAccessAge : projectionEndAge;
  const investAtAccessAge = retireBeforeSuper ? phase1FinalBalance : investAtFire;
  const totalAtAccess = investAtAccessAge + superAtAccess;
  const investFrac = totalAtAccess > 0 ? investAtAccessAge / totalAtAccess : 0.5;
  const superFrac = 1 - investFrac;
  const yearsPostSuper = Math.max(80 - superAccessStartAge, 0);

  let rollingInvestBal = investAtAccessAge;
  for (let y = 0; y < yearsPostSuper; y++) {
    const thisYearExpenses = expensesAtSuperAccess * Math.pow(1.025, y);
    rollingInvestBal = Math.max(rollingInvestBal * (1 + investRate) - thisYearExpenses * investFrac, 0);
    investJourney.push({ age: superAccessStartAge + y + 1, balance: rollingInvestBal, principalPortion: rollingInvestBal, phase: "drawdown-combined" });
  }

  // ── Candle chart data (add invest/super portions) ─────────────────────────────

  const candleData: CandlePoint[] = candleRaw.map((c) => ({
    ...c,
    investPortion: c.phase === 2 ? c.remaining * investFrac : c.remaining,
    superPortion:  c.phase === 2 ? c.remaining * superFrac  : 0,
  }));

  // ── Super full schedule: phases 1+2 (accumulation) + phase 3 (drawdown) ───────

  const superFullSchedule: SuperPoint[] = superCombinedSchedule.map((s) => ({
    age: s.age,
    value: s.balance,
    phase: (retireBeforeSuper && effectiveFireAge !== null && s.age > effectiveFireAge ? 2 : 1) as 1 | 2 | 3,
  }));

  let superBal = superAtAccess;
  const superStartWithdrawal = expensesAtSuperAccess * superFrac;
  for (let y = 0; y < 100 - superAccessAge; y++) {
    superBal = Math.max(superBal * (1 + superRate) - superStartWithdrawal * Math.pow(1.025, y), 0);
    superFullSchedule.push({ age: superAccessAge + y + 1, value: superBal, phase: 3 });
  }

  // ── FI/RE progress — invest-only NW ──────────────────────────────────────────

  const investNWSchedule = compoundGrowthSchedule({
    principal: investNW,
    annualRate: investRate,
    years: Math.max(projectionEndAge - age + 10, 30),
    annualContribution: investContribution,
    currentAge: age,
  });
  const investFireBarIdx = investNWSchedule.findIndex((s) => s.balance >= target);

  // ── Income series to age 100 ───────────────────────────────────────────────────

  const fireAgeForIncome = effectiveFireAge ?? FALLBACK_HORIZON;
  const incExpFull: IncomePoint[] = Array.from({ length: 100 - age }, (_, i) => {
    const yr = age + i + 1;
    const inflExp = Math.round(annualExpenses * Math.pow(1.025, i));
    if (yr <= fireAgeForIncome)
      return { age: yr, workingIncome: netIncome, investIncome: 0, superIncome: 0, expenses: inflExp };
    if (retireBeforeSuper && yr < superAccessAge)
      return { age: yr, workingIncome: 0, investIncome: inflExp, superIncome: 0, expenses: inflExp };
    return {
      age: yr, workingIncome: 0,
      investIncome: Math.round(inflExp * (1 - superFrac)),
      superIncome: Math.round(inflExp * superFrac),
      expenses: inflExp,
    };
  });

  const retirementPortfolio = superAtAccess + investAtFire;

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center gap-3">
        <span className="text-xl font-bold text-emerald-400">FI/RE</span>
        <span className="text-gray-500 text-sm">Financial Independence, Retire Early</span>
      </header>

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-49px)]">

        {/* ── Inputs ────────────────────────────────────────────────────────── */}
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
            <Slider
              label="Super access age"
              value={superAccessAge}
              onChange={(v) => setSuperAccessAge(Math.max(60, v))}
              min={60} max={75}
              display={String(superAccessAge)}
              note="Preservation age — cannot be below 60"
            />
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
            <div className="mt-2 bg-gray-800 rounded-lg p-3 space-y-1 text-xs">
              <div className="flex justify-between text-gray-400"><span>Per month</span><span className="text-white">{fmt(monthlyExpenses)}</span></div>
              <div className="flex justify-between text-gray-400"><span>Per week</span><span className="text-white">{fmt(weeklyExpenses)}</span></div>
              <div className="flex justify-between text-gray-400">
                <span>% of net income</span>
                <span className={expenseToIncomeRatio > 0.85 ? "text-amber-400" : expenseToIncomeRatio > 0.7 ? "text-yellow-400" : "text-white"}>
                  {netIncome > 0 ? fmtPct(expenseToIncomeRatio) : "—"}
                </span>
              </div>
              <div className="flex justify-between font-semibold border-t border-gray-700 pt-1">
                <span className="text-gray-300">Annual surplus</span>
                <span className={annualSurplus >= 0 ? "text-emerald-400" : "text-amber-400"}>{fmt(annualSurplus)}</span>
              </div>
            </div>
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
            <Metric label="Investments at FI/RE" value={fmtK(investAtFire)} note={effectiveFireAge ? `Age ${effectiveFireAge}` : "—"} />
            <Metric label={`Super at ${superAccessAge}`} value={fmtK(superAtAccess)} note={retireBeforeSuper ? "Grows untouched until access" : undefined} />
            <Metric label="Retirement portfolio" value={fmtK(retirementPortfolio)} note="Investments + super" />
            <Metric label="Portfolio lasts" value={drawdownLasts ? `${drawdownLasts} yrs` : "100+ yrs"} good={drawdownLasts === null} />
          </div>

          {retireBeforeSuper && effectiveFireAge !== null && (
            <div className="bg-amber-950/50 border border-amber-700/50 rounded-xl p-3 text-sm text-amber-300">
              <strong>Super access gap ({superAccessAge - effectiveFireAge} yrs):</strong>{" "}
              FI/RE at {effectiveFireAge} but super locked until {superAccessAge}.
              Investments ({fmtK(investAtFire)}) fund {fmt(annualExpenses)}/yr alone until then.
              At {superAccessAge}, super ({fmtK(superAtAccess)}) joins the pool.
            </div>
          )}

          {/* FI/RE Progress */}
          <Chart
            title="FI/RE Progress — Investments Only"
            description={`Investment portfolio (no super) toward ${fmtK(target)} target. Super excluded — locked until age ${superAccessAge}. Bars turn green once the target is crossed at age ${effectiveFireAge ?? "—"}.`}
          >
            <FireProgressChart
              data={investNWSchedule.map((s) => ({ age: s.age, value: s.balance }))}
              target={target}
              fireBarIdx={investFireBarIdx}
            />
          </Chart>

          {/* Income & Expenses — line chart to 100 */}
          <Chart
            title="Income & Expenses — to Age 100"
            description={`Employment income (emerald) until FI/RE at age ${effectiveFireAge ?? "—"}. Investment drawdown (sky) bridges the gap${retireBeforeSuper ? ` until super unlocks at ${superAccessAge}` : ""}. Super drawdown (teal) from age ${superAccessAge}. Red dashed = inflation-adjusted expenses. Hover for values.`}
          >
            <IncExpLineChart data={incExpFull} fireAge={effectiveFireAge} superAccessAge={superAccessAge} />
          </Chart>

          {/* Superannuation — full to 100 */}
          <Chart
            title="Superannuation — to Age 100"
            description={
              retireBeforeSuper && effectiveFireAge !== null
                ? `Emerald = contributing (age ${age}–${effectiveFireAge}). Teal = locked growth (${effectiveFireAge}–${superAccessAge}) → ${fmtK(superAtAccess)}. Orange = proportional drawdown from age ${superAccessAge}.`
                : `Emerald = contribution phase (age ${age}–${superAccessAge}) → ${fmtK(superAtAccess)}. Orange = proportional drawdown from age ${superAccessAge}.`
            }
          >
            <SuperChart
              data={superFullSchedule}
              phase2StartAge={retireBeforeSuper && effectiveFireAge !== null ? effectiveFireAge : null}
            />
          </Chart>

          {/* Investments — journey to age 80 */}
          <Chart
            title="Investments Outside Super — to Age 80"
            description={
              retireBeforeSuper && effectiveFireAge !== null
                ? `Sky = growth (age ${age}–${effectiveFireAge}). Medium sky = invest-only drawdown (${effectiveFireAge}–${superAccessAge}). Violet = investments share of combined drawdown after super unlocks.`
                : `Sky = growth to FI/RE (age ${effectiveFireAge ?? "—"}). Violet = your share of combined drawdown to age 80.`
            }
          >
            <InvestmentJourneyChart data={investJourney} fireAge={effectiveFireAge} superAccessAge={superAccessAge} />
          </Chart>

          {/* Candle chart — retirement portfolio */}
          {candleData.length > 0 && (
            <Chart
              title="Retirement Portfolio — Annual Candle View"
              description={`Each candle: body = portfolio balance remaining after withdrawals (sky = investments, orange = super). Wick above = annual withdrawal consumed. Shows the drawdown progression from FI/RE age ${effectiveFireAge ?? "—"} to 100.`}
            >
              <CandleChart data={candleData} superUnlockAge={retireBeforeSuper ? superAccessAge : (effectiveFireAge ?? projectionEndAge)} />
            </Chart>
          )}

          {/* Drawdown — to age 80 */}
          <Chart
            title="Retirement Drawdown — to Age 80"
            description={
              retireBeforeSuper && effectiveFireAge !== null
                ? `Sky = investments only (age ${effectiveFireAge}–${superAccessAge}). Violet = super + investments from ${superAccessAge}. ${drawdownLasts && drawdownLasts <= 80 ? `Depleted at year ${drawdownLasts}.` : "Healthy at 80."}`
                : `Starting ${fmtK(retirementPortfolio)} at age ${projectionEndAge}, withdrawing ${fmt(annualExpenses)}/yr inflation-adjusted.`
            }
          >
            <DrawdownChart data={drawdownTo80} superUnlockAge={retireBeforeSuper ? superAccessAge : null} />
          </Chart>

          {/* Generational wealth — 80 to 100 */}
          <Chart
            title="Generational Wealth — Age 80 to 100"
            description={`Portfolio balance from age 80 onward. Remaining wealth for estate, family, or charitable giving. ${drawdownLasts && drawdownLasts > 80 ? `Depleted at retirement year ${drawdownLasts}.` : drawdownFrom80.some(d => d.value > 0) ? "Portfolio survives to 100." : "Portfolio depleted before 80 — revisit strategy."}`}
          >
            {drawdownFrom80.length > 0 && drawdownFrom80.some(d => d.value > 0) ? (
              <DrawdownChart data={drawdownFrom80} superUnlockAge={null} />
            ) : (
              <p className="text-amber-500 text-sm py-4">Portfolio depleted before age 80 — consider a lower SWR or higher savings rate.</p>
            )}
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

// ─── Metric ───────────────────────────────────────────────────────────────────

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

// ─── Shared bar age labels ────────────────────────────────────────────────────

function AgeLabels({ data, labelEvery }: { data: { age: number }[]; labelEvery: number }) {
  return (
    <div className="flex min-w-max mt-1" style={{ gap: BAR_GAP }}>
      {data.map((d, i) => (
        <div key={i} className="flex-shrink-0 text-center" style={{ width: BAR_W }}>
          {i % labelEvery === 0 && <span className="text-xs text-gray-600">{d.age}</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Super chart — 3 phases ───────────────────────────────────────────────────

function SuperChart({ data, phase2StartAge }: {
  data: SuperPoint[];
  phase2StartAge: number | null;
}) {
  if (!data.length) return <p className="text-gray-600 text-xs">No data</p>;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));

  return (
    <div className="overflow-x-auto">
      <div className="flex flex-wrap gap-4 mb-2 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-600" /> Contributing</span>
        {phase2StartAge !== null && <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-teal-600" /> Locked — growth only</span>}
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-500" /> Drawdown</span>
      </div>
      <div className="flex items-end min-w-max" style={{ height: CHART_H, gap: BAR_GAP }}>
        {data.map((d, i) => {
          const h = Math.max(Math.round((d.value / maxVal) * CHART_H), 2);
          const cls = d.phase === 3 ? "bg-orange-500 hover:bg-orange-400" : d.phase === 2 ? "bg-teal-600 hover:bg-teal-400" : "bg-emerald-600 hover:bg-emerald-400";
          const lbl = d.phase === 3 ? " (drawdown)" : d.phase === 2 ? " (locked)" : "";
          return (
            <div key={i} title={`Age ${d.age}: ${fmt(d.value)}${lbl}`}
              className={`flex-shrink-0 rounded-sm transition-colors cursor-pointer ${cls}`}
              style={{ width: BAR_W, height: h }} />
          );
        })}
      </div>
      <AgeLabels data={data} labelEvery={labelEvery} />
    </div>
  );
}

// ─── Investment journey chart (stacked, three phases) ─────────────────────────

function InvestmentJourneyChart({ data, fireAge, superAccessAge }: {
  data: InvestPoint[];
  fireAge: number | null;
  superAccessAge: number;
}) {
  if (!data.length) return <p className="text-gray-600 text-xs">No data</p>;
  const maxVal = Math.max(...data.map((d) => d.balance), 1);
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));

  const fireMarkerLeft = fireAge !== null
    ? data.findIndex((d) => d.age >= fireAge) * STEP + Math.floor(BAR_W / 2)
    : -1;
  const superIdx = data.findIndex((d) => d.age >= superAccessAge);
  const superMarkerLeft = superIdx >= 0 ? superIdx * STEP + Math.floor(BAR_W / 2) : -1;

  return (
    <div className="overflow-x-auto">
      <div className="flex flex-wrap gap-4 mb-2 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-700" /> Contributions</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-400" /> Growth</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-600" /> Drawdown (invest only)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-violet-600" /> Drawdown (combined)</span>
      </div>

      <div className="relative min-w-max pt-5" style={{ height: CHART_H + 36 }}>
        {fireMarkerLeft >= 0 && (
          <div className="absolute bottom-5 top-5 w-px bg-emerald-400/70 pointer-events-none" style={{ left: fireMarkerLeft }}>
            <span className="absolute top-0 left-2 text-xs text-emerald-400 whitespace-nowrap font-semibold">FI/RE {fireAge}</span>
          </div>
        )}
        {superMarkerLeft >= 0 && (
          <div className="absolute bottom-5 top-5 w-px bg-teal-400/70 pointer-events-none" style={{ left: superMarkerLeft }}>
            <span className="absolute top-4 left-2 text-xs text-teal-400 whitespace-nowrap">Super {superAccessAge}</span>
          </div>
        )}

        <div className="absolute bottom-5 left-0 flex items-end min-w-max" style={{ gap: BAR_GAP }}>
          {data.map((d, i) => {
            const totalH = Math.max(Math.round((d.balance / maxVal) * CHART_H), 2);
            if (d.phase === "grow") {
              const principalH = Math.round((d.principalPortion / d.balance) * totalH);
              const growthH = totalH - principalH;
              return (
                <div key={i} className="flex-shrink-0 flex flex-col cursor-pointer" style={{ width: BAR_W }}
                  title={`Age ${d.age}: ${fmt(d.balance)} (contributions: ${fmt(d.principalPortion)}, growth: ${fmt(d.balance - d.principalPortion)})`}>
                  {growthH > 0 && <div className="w-full bg-sky-400 hover:bg-sky-300 transition-colors rounded-t-sm" style={{ height: growthH }} />}
                  {principalH > 0 && <div className="w-full bg-sky-700 hover:bg-sky-600 transition-colors" style={{ height: principalH }} />}
                </div>
              );
            }
            const cls = d.phase === "drawdown-invest" ? "bg-sky-600 hover:bg-sky-400" : "bg-violet-600 hover:bg-violet-400";
            return (
              <div key={i} title={`Age ${d.age}: ${fmt(d.balance)}`}
                className={`flex-shrink-0 rounded-sm transition-colors cursor-pointer ${cls}`}
                style={{ width: BAR_W, height: totalH }} />
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
      <div className="relative min-w-max pt-5" style={{ height: CHART_H + 36 }}>
        <div className="absolute left-0 right-0 border-t border-dashed border-emerald-500/50 pointer-events-none"
          style={{ bottom: thresholdH + 20 }} />
        {markerLeft >= 0 && (
          <div className="absolute bottom-5 top-5 w-px bg-emerald-400/80 pointer-events-none" style={{ left: markerLeft }}>
            <span className="absolute top-0 left-2 text-xs text-emerald-400 whitespace-nowrap font-semibold">
              FI/RE age {data[fireBarIdx]?.age}
            </span>
          </div>
        )}
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

// ─── Drawdown chart ───────────────────────────────────────────────────────────

function DrawdownChart({ data, superUnlockAge }: {
  data: DrawdownPoint[];
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
      <div className="relative min-w-max pt-5" style={{ height: CHART_H + 36 }}>
        {unlockLeft >= 0 && (
          <div className="absolute bottom-5 top-5 w-px bg-teal-400/70 pointer-events-none" style={{ left: unlockLeft }}>
            <span className="absolute top-0 left-2 text-xs text-teal-400 whitespace-nowrap">Super unlocks {superUnlockAge}</span>
          </div>
        )}
        <div className="absolute bottom-5 left-0 flex items-end min-w-max" style={{ gap: BAR_GAP }}>
          {data.map((d, i) => {
            const h = Math.max(Math.round((d.value / maxVal) * CHART_H), 2);
            const cls = d.depleted ? "bg-red-700 hover:bg-red-500" : d.phase === 1 ? "bg-sky-600 hover:bg-sky-400" : "bg-violet-600 hover:bg-violet-400";
            return (
              <div key={i} title={`Age ${d.age}: ${fmt(d.value)}`}
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

// ─── Candle chart — body = remaining (invest/super split), wick = withdrawn ───

function CandleChart({ data, superUnlockAge }: {
  data: CandlePoint[];
  superUnlockAge: number;
}) {
  if (!data.length) return <p className="text-gray-600 text-xs">No data</p>;
  const maxVal = Math.max(...data.map((d) => d.remaining + d.withdrawn), 1);
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));
  const superIdx = data.findIndex((d) => d.age >= superUnlockAge);
  const superLeft = superIdx >= 0 ? superIdx * STEP + Math.floor(BAR_W / 2) : -1;

  return (
    <div className="overflow-x-auto">
      <div className="flex flex-wrap gap-4 mb-2 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-600" /> Investments balance</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-500" /> Super balance</span>
        <span className="flex items-center gap-1"><span className="inline-block w-0.5 h-3 rounded bg-rose-500" /> Annual withdrawal (wick)</span>
      </div>

      <div className="relative min-w-max pt-5" style={{ height: CHART_H + 36 }}>
        {superLeft >= 0 && (
          <div className="absolute bottom-5 top-5 w-px bg-teal-400/70 pointer-events-none" style={{ left: superLeft }}>
            <span className="absolute top-0 left-2 text-xs text-teal-400 whitespace-nowrap">Super {superUnlockAge}</span>
          </div>
        )}

        <div className="absolute bottom-5 left-0 flex items-end min-w-max" style={{ gap: BAR_GAP }}>
          {data.map((d, i) => {
            const total = d.remaining + d.withdrawn;
            const totalH = Math.max(Math.round((total / maxVal) * CHART_H), 2);
            const bodyH = d.depleted ? 0 : Math.max(Math.round((d.remaining / Math.max(total, 1)) * totalH), 1);
            const wickH = Math.max(totalH - bodyH, 1);

            const superFraction = d.remaining > 0 ? d.superPortion / d.remaining : 0;
            const superH = Math.round(superFraction * bodyH);
            const investH = bodyH - superH;

            const wickColor = d.depleted ? "#b91c1c" : "#f43f5e";

            return (
              <div
                key={i}
                className="flex-shrink-0 flex flex-col items-center cursor-pointer"
                style={{ width: BAR_W, height: totalH }}
                title={`Age ${d.age} — Total: ${fmt(total)}, Withdrawn: ${fmt(d.withdrawn)}, Remaining: ${fmt(d.remaining)}${d.superPortion > 0 ? ` (invest ${fmt(d.investPortion)}, super ${fmt(d.superPortion)})` : ""}`}
              >
                {/* Wick — annual withdrawal (thin, above body) */}
                <div className="flex-none rounded-t-sm" style={{ width: 2, height: wickH, background: wickColor }} />
                {/* Body — remaining balance */}
                {bodyH > 0 && (
                  <div className="flex-none w-full flex flex-col" style={{ height: bodyH }}>
                    {superH > 0 && (
                      <div className="w-full bg-orange-500 hover:bg-orange-400 transition-colors" style={{ height: superH }} />
                    )}
                    {investH > 0 && (
                      <div
                        className={`w-full bg-sky-600 hover:bg-sky-400 transition-colors${superH === 0 ? " rounded-t-sm" : ""}`}
                        style={{ height: investH }}
                      />
                    )}
                  </div>
                )}
              </div>
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

// ─── Income & Expenses SVG line chart with hover tooltip ──────────────────────

function IncExpLineChart({ data, fireAge, superAccessAge }: {
  data: IncomePoint[];
  fireAge: number | null;
  superAccessAge: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data.length) return <p className="text-gray-600 text-xs">No data</p>;

  const W = 600;
  const H = 200;
  const MT = 12;
  const MB = 20;
  const ML = 4;
  const MR = 4;
  const plotW = W - ML - MR;
  const plotH = H - MT - MB;

  const minAge = data[0].age;
  const maxAge = data[data.length - 1].age;
  const ageSpan = Math.max(maxAge - minAge, 1);

  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.workingIncome, d.expenses, d.investIncome + d.superIncome)),
    1
  );

  const xPos = (a: number) => ML + ((a - minAge) / ageSpan) * plotW;
  const yPos = (v: number) => MT + plotH * (1 - Math.min(v / maxVal, 1));

  const pathFor = (fn: (d: IncomePoint) => number) =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${xPos(d.age).toFixed(1)} ${yPos(fn(d)).toFixed(1)}`).join(" ");

  const labelAges: number[] = [];
  for (let a = Math.ceil(minAge / 10) * 10; a <= maxAge; a += 10) labelAges.push(a);

  const fireX = fireAge !== null ? xPos(fireAge) : null;
  const superX = xPos(superAccessAge);

  const isHovering = hoverIdx !== null;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const rawIdx = Math.round(((svgX - ML) / plotW) * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(rawIdx, data.length - 1)));
  };

  const hd = hoverIdx !== null ? data[hoverIdx] : null;
  const hcx = hd ? xPos(hd.age) : 0;
  const tooltipW = 136;
  const tooltipX = hcx + 8 + tooltipW > W - MR ? hcx - tooltipW - 8 : hcx + 8;

  const opacity = isHovering ? "1" : "0.8";

  return (
    <div className="overflow-x-auto">
      <div className="flex flex-wrap gap-4 mb-2 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#10b981" strokeWidth="2" /></svg>
          Employment income
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#0ea5e9" strokeWidth="2" /></svg>
          Investment drawdown
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#14b8a6" strokeWidth="2" /></svg>
          Super drawdown
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2" /></svg>
          Expenses (inflation-adj.)
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: 360, cursor: isHovering ? "crosshair" : "default" }}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Grid */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={ML} y1={MT + plotH * (1 - f)} x2={ML + plotW} y2={MT + plotH * (1 - f)}
            stroke="#1f2937" strokeWidth="1" />
        ))}

        {/* FI/RE marker */}
        {fireX !== null && (
          <>
            <line x1={fireX} y1={MT} x2={fireX} y2={MT + plotH} stroke="#4ade80" strokeWidth="1" strokeOpacity="0.6" strokeDasharray="3 2" />
            <text x={fireX + 3} y={MT + 9} fill="#4ade80" fontSize="7.5" fontWeight="bold">FI/RE {fireAge}</text>
          </>
        )}

        {/* Super access marker */}
        <line x1={superX} y1={MT} x2={superX} y2={MT + plotH} stroke="#2dd4bf" strokeWidth="1" strokeOpacity="0.6" strokeDasharray="3 2" />
        <text x={superX + 3} y={MT + 19} fill="#2dd4bf" fontSize="7.5">Super {superAccessAge}</text>

        {/* Lines */}
        <path d={pathFor((d) => d.expenses)} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="5 3" strokeOpacity={opacity} />
        <path d={pathFor((d) => d.investIncome)} fill="none" stroke="#0ea5e9" strokeWidth={isHovering ? "2" : "1.5"} strokeOpacity={opacity} />
        <path d={pathFor((d) => d.superIncome)} fill="none" stroke="#14b8a6" strokeWidth={isHovering ? "2" : "1.5"} strokeOpacity={opacity} />
        <path d={pathFor((d) => d.workingIncome)} fill="none" stroke="#10b981" strokeWidth={isHovering ? "2.5" : "2"} strokeOpacity={opacity} />

        {/* Hover overlay */}
        {hd !== null && (
          <>
            {/* Crosshair */}
            <line x1={hcx} y1={MT} x2={hcx} y2={MT + plotH} stroke="#6b7280" strokeWidth="1" strokeOpacity="0.5" />

            {/* Dots on each line */}
            {hd.workingIncome > 0 && <circle cx={hcx} cy={yPos(hd.workingIncome)} r="3.5" fill="#10b981" stroke="#111827" strokeWidth="1" />}
            {hd.investIncome > 0 && <circle cx={hcx} cy={yPos(hd.investIncome)} r="3.5" fill="#0ea5e9" stroke="#111827" strokeWidth="1" />}
            {hd.superIncome > 0 && <circle cx={hcx} cy={yPos(hd.superIncome)} r="3.5" fill="#14b8a6" stroke="#111827" strokeWidth="1" />}
            <circle cx={hcx} cy={yPos(hd.expenses)} r="3.5" fill="#ef4444" stroke="#111827" strokeWidth="1" />

            {/* Tooltip box */}
            <rect x={tooltipX} y={MT} width={tooltipW} height={92} rx="3" fill="#0f172a" stroke="#374151" strokeWidth="0.75" />
            <text x={tooltipX + 7} y={MT + 12} fill="#9ca3af" fontSize="8" fontWeight="600">Age {hd.age}</text>
            {hd.workingIncome > 0 && (
              <text x={tooltipX + 7} y={MT + 26} fill="#10b981" fontSize="7.5">Work income: {fmtK(hd.workingIncome)}</text>
            )}
            {hd.investIncome > 0 && (
              <text x={tooltipX + 7} y={MT + 38} fill="#0ea5e9" fontSize="7.5">Invest drawdown: {fmtK(hd.investIncome)}</text>
            )}
            {hd.superIncome > 0 && (
              <text x={tooltipX + 7} y={MT + 50} fill="#14b8a6" fontSize="7.5">Super drawdown: {fmtK(hd.superIncome)}</text>
            )}
            <text x={tooltipX + 7} y={MT + 62} fill="#ef4444" fontSize="7.5">Expenses: {fmtK(hd.expenses)}</text>
            <line x1={tooltipX + 7} y1={MT + 69} x2={tooltipX + tooltipW - 7} y2={MT + 69} stroke="#374151" strokeWidth="0.5" />
            <text x={tooltipX + 7} y={MT + 80} fill={
              (hd.workingIncome + hd.investIncome + hd.superIncome) >= hd.expenses ? "#34d399" : "#f59e0b"
            } fontSize="7.5" fontWeight="600">
              {(hd.workingIncome + hd.investIncome + hd.superIncome) >= hd.expenses
                ? `Surplus: ${fmtK(hd.workingIncome + hd.investIncome + hd.superIncome - hd.expenses)}`
                : `Gap: ${fmtK(hd.expenses - hd.workingIncome - hd.investIncome - hd.superIncome)}`
              }
            </text>
          </>
        )}

        {/* Age axis labels */}
        {labelAges.map((a) => (
          <text key={a} x={xPos(a)} y={H - 4} fill="#4b5563" fontSize="8" textAnchor="middle">{a}</text>
        ))}
      </svg>
    </div>
  );
}
