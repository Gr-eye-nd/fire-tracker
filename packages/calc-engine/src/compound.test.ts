import { describe, test, expect } from "vitest";
import { futureValue, compoundGrowthSchedule, requiredAnnualContribution, realRate } from "./compound";

describe("futureValue", () => {
  test("no contributions", () => {
    expect(futureValue({ principal: 10_000, annualRate: 0.07, years: 10 })).toBeCloseTo(19_671.51, 0);
  });

  test("with annual contributions", () => {
    const fv = futureValue({ principal: 10_000, annualRate: 0.07, years: 10, annualContribution: 5_000 });
    expect(fv).toBeGreaterThan(10_000 + 5_000 * 10);
  });

  test("zero rate", () => {
    expect(futureValue({ principal: 1_000, annualRate: 0, years: 5, annualContribution: 200 })).toBe(2_000);
  });
});

describe("compoundGrowthSchedule", () => {
  test("returns correct number of years", () => {
    const s = compoundGrowthSchedule({ principal: 10_000, annualRate: 0.07, years: 5 });
    expect(s).toHaveLength(5);
  });

  test("balance grows each year", () => {
    const s = compoundGrowthSchedule({ principal: 10_000, annualRate: 0.07, years: 5 });
    for (let i = 1; i < s.length; i++) {
      expect(s[i]!.balance).toBeGreaterThan(s[i - 1]!.balance);
    }
  });

  test("tracks age correctly", () => {
    const s = compoundGrowthSchedule({ principal: 0, annualRate: 0.07, years: 3, currentAge: 30 });
    expect(s.map((r) => r.age)).toEqual([31, 32, 33]);
  });
});

describe("requiredAnnualContribution", () => {
  test("returns 0 when principal already exceeds target", () => {
    expect(requiredAnnualContribution({ principal: 1_000_000, annualRate: 0.07, years: 10, targetFV: 500_000 })).toBe(0);
  });

  test("matches futureValue round-trip", () => {
    const contrib = requiredAnnualContribution({ principal: 10_000, annualRate: 0.07, years: 20, targetFV: 500_000 });
    const fv = futureValue({ principal: 10_000, annualRate: 0.07, years: 20, annualContribution: contrib });
    expect(fv).toBeCloseTo(500_000, -2);
  });
});

describe("realRate", () => {
  test("7% nominal, 2.5% inflation ≈ 4.39% real", () => {
    expect(realRate(0.07, 0.025)).toBeCloseTo(0.0439, 3);
  });
});
