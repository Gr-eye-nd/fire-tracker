export interface AUTaxResult {
  taxableIncome: number;
  grossTax: number;
  lito: number;
  incomeTax: number;
  medicareLevy: number;
  totalTax: number;
  netIncome: number;
  effectiveRate: number;
  marginalRate: number;
}

/**
 * Australian income tax for 2024-25 (Stage 3 cuts in effect).
 * Includes LITO and Medicare levy.
 * Does not include HELP/HECS repayments, private health rebates, or other offsets.
 */
export function australianIncomeTax(
  grossSalary: number,
  otherTaxableIncome = 0
): AUTaxResult {
  const taxableIncome = Math.max(0, grossSalary + otherTaxableIncome);

  // 2024-25 tax brackets
  let grossTax = 0;
  if (taxableIncome <= 18_200) grossTax = 0;
  else if (taxableIncome <= 45_000) grossTax = (taxableIncome - 18_200) * 0.16;
  else if (taxableIncome <= 135_000) grossTax = 4_288 + (taxableIncome - 45_000) * 0.3;
  else if (taxableIncome <= 190_000) grossTax = 31_288 + (taxableIncome - 135_000) * 0.37;
  else grossTax = 51_638 + (taxableIncome - 190_000) * 0.45;

  // Low Income Tax Offset
  let lito = 0;
  if (taxableIncome <= 37_500) lito = 700;
  else if (taxableIncome <= 45_000) lito = 700 - (taxableIncome - 37_500) * 0.05;
  else if (taxableIncome <= 66_667) lito = 325 - (taxableIncome - 45_000) * 0.015;
  lito = Math.max(0, Math.round(lito));

  const incomeTax = Math.max(0, Math.round(grossTax - lito));

  // Medicare levy (2% with low-income shade-in)
  let medicareLevy = 0;
  if (taxableIncome > 32_500) medicareLevy = Math.round(taxableIncome * 0.02);
  else if (taxableIncome > 26_000) medicareLevy = Math.round((taxableIncome - 26_000) * 0.1);

  const totalTax = incomeTax + medicareLevy;
  const netIncome = Math.round(taxableIncome - totalTax);
  const effectiveRate = taxableIncome > 0 ? Math.round((totalTax / taxableIncome) * 1000) / 1000 : 0;

  let marginalRate = 0;
  if (taxableIncome > 190_000) marginalRate = 0.47;
  else if (taxableIncome > 135_000) marginalRate = 0.39;
  else if (taxableIncome > 45_000) marginalRate = 0.32;
  else if (taxableIncome > 18_200) marginalRate = 0.18;

  return { taxableIncome, grossTax: Math.round(grossTax), lito, incomeTax, medicareLevy, totalTax, netIncome, effectiveRate, marginalRate };
}

/**
 * Employer Super Guarantee contribution (on top of salary, not included in it).
 */
export function employerSG(salary: number, financialYear = 2026): number {
  const rate = financialYear <= 2025 ? 0.115 : 0.12;
  return Math.round(salary * rate);
}
