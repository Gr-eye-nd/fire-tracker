import type { AssetBreakdown, FireSnapshot } from "./types.js";
import { futureValue } from "./compound.js";

export const DEFAULT_SWR = 0.04;

/**
 * Target portfolio size to sustain annual expenses indefinitely (the "FI/RE number").
 * Defaults to the 4% safe withdrawal rate.
 */
export function fireNumber(annualExpenses: number, safeWithdrawalRate = DEFAULT_SWR): number {
  return round(annualExpenses / safeWithdrawalRate);
}

/**
 * Savings rate as a percentage of gross income.
 */
export function savingsRate(annualIncome: number, annualExpenses: number): number {
  if (annualIncome <= 0) return 0;
  return round(((annualIncome - annualExpenses) / annualIncome) * 100);
}

/**
 * Total net worth across asset classes.
 */
export function totalNetWorth(assets: AssetBreakdown): number {
  return round(
    assets.super + assets.investments + assets.property + assets.cash + assets.other
  );
}

export interface YearsToFireParams {
  currentNetWorth: number;
  annualSavings: number;
  annualGrowthRate: number;
  annualExpenses: number;
  currentAge: number;
  safeWithdrawalRate?: number;
  maxYears?: number;
}

export interface YearsToFireResult {
  yearsToFire: number | null;
  fireAge: number | null;
  targetFireNumber: number;
  schedule: FireSnapshot[];
}

/**
 * Year-by-year projection to FI/RE.
 * Returns the number of years until net worth crosses the FI/RE number.
 * Returns null if not reached within maxYears.
 */
export function yearsToFire({
  currentNetWorth,
  annualSavings,
  annualGrowthRate,
  annualExpenses,
  currentAge,
  safeWithdrawalRate = DEFAULT_SWR,
  maxYears = 60,
}: YearsToFireParams): YearsToFireResult {
  const target = fireNumber(annualExpenses, safeWithdrawalRate);
  const schedule: FireSnapshot[] = [];
  let netWorth = currentNetWorth;
  let fireYear: number | null = null;

  for (let y = 1; y <= maxYears; y++) {
    const growth = round((netWorth + annualSavings) * annualGrowthRate);
    netWorth = round(netWorth + annualSavings + growth);
    const progressPct = round((netWorth / target) * 100);

    if (fireYear === null && netWorth >= target) {
      fireYear = y;
    }

    schedule.push({
      year: y,
      age: currentAge + y,
      netWorth,
      annualSavings,
      fireNumber: target,
      progressPct: Math.min(progressPct, 100),
      yearsRemaining: fireYear !== null ? 0 : null,
    });

    if (fireYear !== null && y >= fireYear) break;
  }

  return {
    yearsToFire: fireYear,
    fireAge: fireYear !== null ? currentAge + fireYear : null,
    targetFireNumber: target,
    schedule,
  };
}

/**
 * Coast FI/RE number: how much you need invested today so compound growth alone
 * reaches your FI/RE number by retirement age, without any further savings.
 */
export function coastFireNumber({
  fireTarget,
  annualGrowthRate,
  yearsToRetirement,
}: {
  fireTarget: number;
  annualGrowthRate: number;
  yearsToRetirement: number;
}): number {
  return round(fireTarget / Math.pow(1 + annualGrowthRate, yearsToRetirement));
}

/**
 * Barista FI/RE: reduced FI/RE number when part-time income covers some expenses.
 */
export function baristaFireNumber({
  annualExpenses,
  partTimeIncome,
  safeWithdrawalRate = DEFAULT_SWR,
}: {
  annualExpenses: number;
  partTimeIncome: number;
  safeWithdrawalRate?: number;
}): number {
  const portfolioMustCover = Math.max(annualExpenses - partTimeIncome, 0);
  return fireNumber(portfolioMustCover, safeWithdrawalRate);
}

/**
 * Annual expenses supportable at current net worth given a SWR.
 */
export function sustainableSpend(netWorth: number, safeWithdrawalRate = DEFAULT_SWR): number {
  return round(netWorth * safeWithdrawalRate);
}

/**
 * How many more years of savings needed given a lump-sum investment today.
 * Useful for "if I invest a windfall, how does that change my timeline?"
 */
export function impactOfLumpSum({
  currentNetWorth,
  lumpSum,
  annualSavings,
  annualGrowthRate,
  annualExpenses,
  currentAge,
  safeWithdrawalRate = DEFAULT_SWR,
}: YearsToFireParams & { lumpSum: number }): {
  withoutLumpSum: YearsToFireResult;
  withLumpSum: YearsToFireResult;
  yearsSaved: number | null;
} {
  const without = yearsToFire({
    currentNetWorth,
    annualSavings,
    annualGrowthRate,
    annualExpenses,
    currentAge,
    safeWithdrawalRate,
  });
  const with_ = yearsToFire({
    currentNetWorth: currentNetWorth + lumpSum,
    annualSavings,
    annualGrowthRate,
    annualExpenses,
    currentAge,
    safeWithdrawalRate,
  });
  const yearsSaved =
    without.yearsToFire !== null && with_.yearsToFire !== null
      ? without.yearsToFire - with_.yearsToFire
      : null;
  return { withoutLumpSum: without, withLumpSum: with_, yearsSaved };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
