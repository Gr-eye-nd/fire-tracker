import type { SuperSnapshot } from "./types";

export const CONCESSIONAL_CAP = 30_000;
export const NON_CONCESSIONAL_CAP = 120_000;
export const BRING_FORWARD_CAP = 360_000;
export const SUPER_TAX_RATE = 0.15;
export const DIVISION_293_RATE = 0.15;
export const DIVISION_293_THRESHOLD = 250_000;
export const LISTO_MAX = 500;
export const LISTO_INCOME_THRESHOLD = 37_000;

export const SUPER_GUARANTEE_RATES: Record<number, number> = {
  2025: 0.115,
  2026: 0.12,
};

export function sgRate(financialYear: number): number {
  return SUPER_GUARANTEE_RATES[financialYear] ?? 0.12;
}

export interface SuperProjectionParams {
  currentBalance: number;
  currentAge: number;
  retirementAge: number;
  annualSalary: number;
  extraConcessional?: number;
  nonConcessionalAnnual?: number;
  annualGrowthRate?: number;
  startFinancialYear?: number;
}

export interface SuperProjectionResult {
  schedule: SuperSnapshot[];
  totalTaxPaid: number;
  finalBalance: number;
  yearsToRetirement: number;
}

/**
 * Projects superannuation balance year-by-year to retirement age.
 *
 * Applies:
 *  - Employer SG contributions (rate varies by year)
 *  - 15% contributions tax on concessional contributions
 *  - Division 293 extra 15% for incomes > $250k
 *  - LISTO refund for low incomes
 *  - Concessional and non-concessional caps
 *  - 15% earnings tax in accumulation phase
 */
export function superProjection({
  currentBalance,
  currentAge,
  retirementAge,
  annualSalary,
  extraConcessional = 0,
  nonConcessionalAnnual = 0,
  annualGrowthRate = 0.07,
  startFinancialYear = 2026,
}: SuperProjectionParams): SuperProjectionResult {
  const years = retirementAge - currentAge;
  const schedule: SuperSnapshot[] = [];
  let balance = currentBalance;
  let totalTaxPaid = 0;
  let cumulativeContributions = 0;

  for (let y = 0; y < years; y++) {
    const fy = startFinancialYear + y;
    const sg = annualSalary * sgRate(fy);

    let concessional = sg + extraConcessional;
    let cappedConcessional = false;
    if (concessional > CONCESSIONAL_CAP) {
      concessional = CONCESSIONAL_CAP;
      cappedConcessional = true;
    }

    let nonConcessional = nonConcessionalAnnual;
    let cappedNonConcessional = false;
    if (nonConcessional > NON_CONCESSIONAL_CAP) {
      nonConcessional = NON_CONCESSIONAL_CAP;
      cappedNonConcessional = true;
    }

    const concessionalTax = concessional * SUPER_TAX_RATE;
    const div293Tax =
      annualSalary > DIVISION_293_THRESHOLD ? concessional * DIVISION_293_RATE : 0;
    const listoRefund =
      annualSalary <= LISTO_INCOME_THRESHOLD
        ? Math.min(concessional * SUPER_TAX_RATE, LISTO_MAX)
        : 0;

    const taxThisYear = round(concessionalTax + div293Tax - listoRefund);
    totalTaxPaid += taxThisYear;

    const netConcessional = round(concessional - taxThisYear);
    const totalContributions = round(netConcessional + nonConcessional);
    cumulativeContributions += totalContributions;

    const earningsGross = round((balance + totalContributions) * annualGrowthRate);
    const earningsTax = round(earningsGross * SUPER_TAX_RATE);
    const growth = round(earningsGross - earningsTax);

    balance = round(balance + totalContributions + growth);

    schedule.push({
      year: y + 1,
      age: currentAge + y + 1,
      balance,
      contributions: totalContributions,
      growth,
      cumulativeContributions,
      concessionalContributions: concessional,
      nonConcessionalContributions: nonConcessional,
      taxPaid: taxThisYear,
      cappedConcessional,
      cappedNonConcessional,
    });
  }

  return {
    schedule,
    totalTaxPaid: round(totalTaxPaid),
    finalBalance: balance,
    yearsToRetirement: years,
  };
}

/**
 * How much can be withdrawn tax-free from super per year in pension phase.
 * In AU pension phase earnings are 0% tax; withdrawals over 60 are tax-free.
 */
export function sustainableSuperDrawdown(
  balance: number,
  annualGrowthRate: number,
  years: number
): number {
  if (annualGrowthRate === 0) return round(balance / years);
  const r = annualGrowthRate;
  const factor = (r * Math.pow(1 + r, years)) / (Math.pow(1 + r, years) - 1);
  return round(balance * factor);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
