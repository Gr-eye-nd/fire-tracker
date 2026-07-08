import { describe, test, expect } from "vitest";
import { drawdownSchedule, sustainableWithdrawal, portfolioLongevity } from "./drawdown.js";

describe("drawdownSchedule", () => {
  const base = {
    portfolioBalance: 1_000_000,
    annualWithdrawal: 40_000,
    annualGrowthRate: 0.07,
    inflationRate: 0.025,
    currentAge: 60,
  };

  test("portfolio survives 30 years at 4% SWR with 7% growth", () => {
    const { portfolioLasts, finalBalance } = drawdownSchedule({ ...base, maxYears: 30 });
    expect(portfolioLasts).toBeNull();
    expect(finalBalance).toBeGreaterThan(0);
  });

  test("portfolio depletes with high withdrawal", () => {
    const { portfolioLasts } = drawdownSchedule({
      ...base,
      annualWithdrawal: 120_000,
      annualGrowthRate: 0.04,
      maxYears: 30,
    });
    expect(portfolioLasts).not.toBeNull();
  });

  test("balance never goes negative", () => {
    const { schedule } = drawdownSchedule({ ...base, annualWithdrawal: 200_000, maxYears: 20 });
    schedule.forEach((s) => expect(s.balance).toBeGreaterThanOrEqual(0));
  });
});

describe("sustainableWithdrawal", () => {
  test("zero rate returns balance / years", () => {
    expect(sustainableWithdrawal({ portfolioBalance: 600_000, annualGrowthRate: 0, years: 30 })).toBe(20_000);
  });

  test("positive rate returns higher than zero-rate equivalent", () => {
    const sw = sustainableWithdrawal({ portfolioBalance: 1_000_000, annualGrowthRate: 0.05, years: 30 });
    expect(sw).toBeGreaterThan(1_000_000 / 30);
  });
});

describe("portfolioLongevity", () => {
  test("returns Infinity when withdrawal < portfolio growth", () => {
    expect(portfolioLongevity({ portfolioBalance: 1_000_000, annualWithdrawal: 10_000, annualGrowthRate: 0.07 })).toBe(Infinity);
  });

  test("returns finite years when withdrawal exceeds growth", () => {
    const years = portfolioLongevity({ portfolioBalance: 1_000_000, annualWithdrawal: 100_000, annualGrowthRate: 0.04 });
    expect(years).toBeGreaterThan(0);
    expect(years).toBeLessThan(50);
  });
});
