import { describe, test, expect } from "vitest";
import { superProjection, CONCESSIONAL_CAP, NON_CONCESSIONAL_CAP } from "./super";

describe("superProjection", () => {
  const base = {
    currentBalance: 100_000,
    currentAge: 35,
    retirementAge: 65,
    annualSalary: 100_000,
    annualGrowthRate: 0.07,
  };

  test("returns correct number of years", () => {
    const { schedule } = superProjection(base);
    expect(schedule).toHaveLength(30);
  });

  test("balance grows each year", () => {
    const { schedule } = superProjection(base);
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i]!.balance).toBeGreaterThan(schedule[i - 1]!.balance);
    }
  });

  test("final balance is significant", () => {
    const { finalBalance } = superProjection(base);
    expect(finalBalance).toBeGreaterThan(1_000_000);
  });

  test("caps concessional contributions when salary + extras exceed cap", () => {
    const { schedule } = superProjection({
      ...base,
      annualSalary: 300_000,
      extraConcessional: 20_000,
    });
    expect(schedule[0]!.cappedConcessional).toBe(true);
    expect(schedule[0]!.concessionalContributions).toBe(CONCESSIONAL_CAP);
  });

  test("caps non-concessional contributions", () => {
    const { schedule } = superProjection({
      ...base,
      nonConcessionalAnnual: 200_000,
    });
    expect(schedule[0]!.cappedNonConcessional).toBe(true);
    expect(schedule[0]!.nonConcessionalContributions).toBe(NON_CONCESSIONAL_CAP);
  });

  test("tax paid is positive", () => {
    const { totalTaxPaid } = superProjection(base);
    expect(totalTaxPaid).toBeGreaterThan(0);
  });
});
