export interface YearlySnapshot {
  year: number;
  age: number;
  balance: number;
  contributions: number;
  growth: number;
  cumulativeContributions: number;
}

export interface SuperSnapshot extends YearlySnapshot {
  concessionalContributions: number;
  nonConcessionalContributions: number;
  taxPaid: number;
  cappedConcessional: boolean;
  cappedNonConcessional: boolean;
}

export interface FireSnapshot {
  year: number;
  age: number;
  netWorth: number;
  annualSavings: number;
  fireNumber: number;
  progressPct: number;
  yearsRemaining: number | null;
}

export interface DrawdownSnapshot {
  year: number;
  age: number;
  balance: number;
  withdrawal: number;
  growth: number;
  inflationAdjustedWithdrawal: number;
  depleted: boolean;
}

export interface AssetBreakdown {
  super: number;
  investments: number;
  property: number;
  cash: number;
  other: number;
}
