import { describe, test, expect } from "vitest";
import { fireNumber, savingsRate, yearsToFire, coastFireNumber, baristaFireNumber, sustainableSpend } from "./fire";

describe("fireNumber", () => {
  test("4% SWR → 25x expenses", () => {
    expect(fireNumber(80_000)).toBe(2_000_000);
  });

  test("3% SWR → 33.33x expenses", () => {
    expect(fireNumber(60_000, 0.03)).toBeCloseTo(2_000_000, -2);
  });
});

describe("savingsRate", () => {
  test("saves 50% of income", () => {
    expect(savingsRate(100_000, 50_000)).toBe(50);
  });

  test("zero income returns 0", () => {
    expect(savingsRate(0, 50_000)).toBe(0);
  });
});

describe("yearsToFire", () => {
  const base = {
    currentNetWorth: 100_000,
    annualSavings: 50_000,
    annualGrowthRate: 0.07,
    annualExpenses: 60_000,
    currentAge: 30,
  };

  test("returns a year when reachable", () => {
    const { yearsToFire: years } = yearsToFire(base);
    expect(years).not.toBeNull();
    expect(years!).toBeGreaterThan(0);
  });

  test("fire age = currentAge + yearsToFire", () => {
    const { yearsToFire: years, fireAge } = yearsToFire(base);
    if (years !== null && fireAge !== null) {
      expect(fireAge).toBe(base.currentAge + years);
    }
  });

  test("schedule progress reaches 100%", () => {
    const { schedule } = yearsToFire(base);
    const last = schedule[schedule.length - 1]!;
    expect(last.progressPct).toBe(100);
  });

  test("returns null if not reachable within maxYears", () => {
    const { yearsToFire: years } = yearsToFire({ ...base, annualSavings: 100, maxYears: 5 });
    expect(years).toBeNull();
  });
});

describe("coastFireNumber", () => {
  test("is less than fire target", () => {
    const target = fireNumber(80_000);
    const coast = coastFireNumber({ fireTarget: target, annualGrowthRate: 0.07, yearsToRetirement: 25 });
    expect(coast).toBeLessThan(target);
  });
});

describe("baristaFireNumber", () => {
  test("is less than full fire number", () => {
    const full = fireNumber(80_000);
    const barista = baristaFireNumber({ annualExpenses: 80_000, partTimeIncome: 30_000 });
    expect(barista).toBeLessThan(full);
  });
});

describe("sustainableSpend", () => {
  test("4% of 1M = 40k", () => {
    expect(sustainableSpend(1_000_000)).toBe(40_000);
  });
});
