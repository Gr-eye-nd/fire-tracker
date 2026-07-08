import type { YearlySnapshot } from "./types.js";

export interface CompoundGrowthParams {
  principal: number;
  annualRate: number;
  years: number;
  annualContribution?: number;
  currentAge?: number;
}

/**
 * Future value of principal + annual contributions compounded yearly.
 * Contributions are assumed at the start of each year (annuity-due).
 */
export function futureValue({
  principal,
  annualRate,
  years,
  annualContribution = 0,
}: CompoundGrowthParams): number {
  const r = annualRate;
  const fvPrincipal = principal * Math.pow(1 + r, years);
  const fvContributions =
    r === 0
      ? annualContribution * years
      : annualContribution * ((Math.pow(1 + r, years) - 1) / r) * (1 + r);
  return round(fvPrincipal + fvContributions);
}

/**
 * Year-by-year schedule of balance, contributions, and growth.
 */
export function compoundGrowthSchedule({
  principal,
  annualRate,
  years,
  annualContribution = 0,
  currentAge = 0,
}: CompoundGrowthParams): YearlySnapshot[] {
  const schedule: YearlySnapshot[] = [];
  let balance = principal;
  let cumulativeContributions = 0;

  for (let y = 1; y <= years; y++) {
    const contributionThisYear = annualContribution;
    const growth = round((balance + contributionThisYear) * annualRate);
    cumulativeContributions += contributionThisYear;
    balance = round(balance + contributionThisYear + growth);

    schedule.push({
      year: y,
      age: currentAge + y,
      balance,
      contributions: contributionThisYear,
      growth,
      cumulativeContributions,
    });
  }

  return schedule;
}

/**
 * Required annual contribution to reach a target future value.
 */
export function requiredAnnualContribution({
  principal,
  annualRate,
  years,
  targetFV,
}: {
  principal: number;
  annualRate: number;
  years: number;
  targetFV: number;
}): number {
  const fvOfPrincipal = principal * Math.pow(1 + annualRate, years);
  const gap = targetFV - fvOfPrincipal;
  if (gap <= 0) return 0;
  if (annualRate === 0) return round(gap / years);
  const fvFactor = ((Math.pow(1 + annualRate, years) - 1) / annualRate) * (1 + annualRate);
  return round(gap / fvFactor);
}

/**
 * Real (inflation-adjusted) annual return rate.
 */
export function realRate(nominalRate: number, inflationRate: number): number {
  return (1 + nominalRate) / (1 + inflationRate) - 1;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
