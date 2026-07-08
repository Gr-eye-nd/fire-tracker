import type { DrawdownSnapshot } from "./types";

export interface DrawdownParams {
  portfolioBalance: number;
  annualWithdrawal: number;
  annualGrowthRate: number;
  inflationRate?: number;
  currentAge?: number;
  maxYears?: number;
}

export interface DrawdownResult {
  schedule: DrawdownSnapshot[];
  portfolioLasts: number | null;
  finalBalance: number;
}

/**
 * Projects portfolio balance year-by-year during drawdown.
 * Withdrawals are inflation-adjusted each year if inflationRate > 0.
 * Returns how many years the portfolio lasts (null = survives maxYears).
 */
export function drawdownSchedule({
  portfolioBalance,
  annualWithdrawal,
  annualGrowthRate,
  inflationRate = 0.025,
  currentAge = 60,
  maxYears = 50,
}: DrawdownParams): DrawdownResult {
  const schedule: DrawdownSnapshot[] = [];
  let balance = portfolioBalance;
  let withdrawal = annualWithdrawal;
  let portfolioLasts: number | null = null;

  for (let y = 1; y <= maxYears; y++) {
    if (balance <= 0) {
      schedule.push({
        year: y,
        age: currentAge + y,
        balance: 0,
        withdrawal: 0,
        growth: 0,
        inflationAdjustedWithdrawal: withdrawal,
        depleted: true,
      });
      continue;
    }

    const growth = round(balance * annualGrowthRate);
    const balanceAfterGrowth = round(balance + growth);
    const actualWithdrawal = Math.min(withdrawal, balanceAfterGrowth);
    balance = round(balanceAfterGrowth - actualWithdrawal);

    const depleted = balance <= 0;
    if (depleted && portfolioLasts === null) {
      portfolioLasts = y;
    }

    schedule.push({
      year: y,
      age: currentAge + y,
      balance,
      withdrawal: actualWithdrawal,
      growth,
      inflationAdjustedWithdrawal: withdrawal,
      depleted,
    });

    withdrawal = round(withdrawal * (1 + inflationRate));
  }

  return {
    schedule,
    portfolioLasts,
    finalBalance: round(balance),
  };
}

/**
 * Maximum annual withdrawal that exhausts the portfolio in exactly `years` years.
 */
export function sustainableWithdrawal({
  portfolioBalance,
  annualGrowthRate,
  years,
}: {
  portfolioBalance: number;
  annualGrowthRate: number;
  years: number;
}): number {
  if (annualGrowthRate === 0) return round(portfolioBalance / years);
  const r = annualGrowthRate;
  const factor = (r * Math.pow(1 + r, years)) / (Math.pow(1 + r, years) - 1);
  return round(portfolioBalance * factor);
}

/**
 * How many years a portfolio lasts at a fixed real withdrawal, without inflation adjustment.
 * Returns Infinity if the portfolio grows faster than it's drawn down.
 */
export function portfolioLongevity({
  portfolioBalance,
  annualWithdrawal,
  annualGrowthRate,
}: {
  portfolioBalance: number;
  annualWithdrawal: number;
  annualGrowthRate: number;
}): number {
  if (annualWithdrawal <= 0) return Infinity;
  const sustainableDrawdown = portfolioBalance * annualGrowthRate;
  if (annualWithdrawal <= sustainableDrawdown) return Infinity;

  // Geometric series: solve for n where balance hits 0
  // n = -ln(1 - r*PV/PMT) / ln(1+r)
  const r = annualGrowthRate;
  if (r === 0) return Math.floor(portfolioBalance / annualWithdrawal);
  const n = -Math.log(1 - (r * portfolioBalance) / annualWithdrawal) / Math.log(1 + r);
  return Math.floor(n);
}

/**
 * Sequence-of-returns risk: runs the same withdrawal plan with a bad-first-decade
 * scenario (lower returns for years 1–10 then recovering) vs a base scenario.
 */
export function sequenceOfReturnsComparison({
  portfolioBalance,
  annualWithdrawal,
  baseGrowthRate,
  badDecadeRate,
  recoveryRate,
  inflationRate = 0.025,
  currentAge = 60,
  maxYears = 40,
}: {
  portfolioBalance: number;
  annualWithdrawal: number;
  baseGrowthRate: number;
  badDecadeRate: number;
  recoveryRate: number;
  inflationRate?: number;
  currentAge?: number;
  maxYears?: number;
}): { base: DrawdownResult; badSequence: DrawdownResult } {
  const base = drawdownSchedule({
    portfolioBalance,
    annualWithdrawal,
    annualGrowthRate: baseGrowthRate,
    inflationRate,
    currentAge,
    maxYears,
  });

  let balance = portfolioBalance;
  let withdrawal = annualWithdrawal;
  const schedule: DrawdownSnapshot[] = [];
  let portfolioLasts: number | null = null;

  for (let y = 1; y <= maxYears; y++) {
    const rate = y <= 10 ? badDecadeRate : recoveryRate;

    if (balance <= 0) {
      schedule.push({
        year: y,
        age: currentAge + y,
        balance: 0,
        withdrawal: 0,
        growth: 0,
        inflationAdjustedWithdrawal: withdrawal,
        depleted: true,
      });
      withdrawal = round(withdrawal * (1 + inflationRate));
      continue;
    }

    const growth = round(balance * rate);
    const balanceAfterGrowth = round(balance + growth);
    const actualWithdrawal = Math.min(withdrawal, balanceAfterGrowth);
    balance = round(balanceAfterGrowth - actualWithdrawal);

    const depleted = balance <= 0;
    if (depleted && portfolioLasts === null) portfolioLasts = y;

    schedule.push({
      year: y,
      age: currentAge + y,
      balance,
      withdrawal: actualWithdrawal,
      growth,
      inflationAdjustedWithdrawal: withdrawal,
      depleted,
    });

    withdrawal = round(withdrawal * (1 + inflationRate));
  }

  return {
    base,
    badSequence: { schedule, portfolioLasts, finalBalance: round(balance) },
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
