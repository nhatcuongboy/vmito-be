/** Amounts round up so the host never ends up short of the real cost. */
export const COST_SPLIT_ROUNDING = 1000;

export interface CostSplitInput {
  total: number;
  /** Money that is already settled: approved payments plus club fees. */
  lockedAmount: number;
  maleCount: number;
  femaleCount: number;
  maleSurcharge: number;
}

export interface CostSplitResult {
  maleAmount: number;
  femaleAmount: number;
  /** False when the surcharge alone exceeds what is left to collect. */
  isValid: boolean;
}

// Mirrored by computeCostSplit in vmito_app's vmito_domain package for the
// live preview; apply compares both results, so keep the two in step.
export function computeCostSplit(input: CostSplitInput): CostSplitResult {
  const { total, lockedAmount, maleCount, femaleCount } = input;
  const payers = maleCount + femaleCount;
  if (payers === 0) {
    return { maleAmount: 0, femaleAmount: 0, isValid: false };
  }

  // A surcharge only means something when both genders are paying.
  const surcharge = maleCount > 0 && femaleCount > 0 ? input.maleSurcharge : 0;
  const remaining = Math.max(0, total - lockedAmount);
  const base = remaining - maleCount * surcharge;
  if (base < 0) {
    return { maleAmount: 0, femaleAmount: 0, isValid: false };
  }

  const femaleAmount =
    Math.ceil(base / payers / COST_SPLIT_ROUNDING) * COST_SPLIT_ROUNDING;
  return {
    maleAmount: femaleAmount + surcharge,
    femaleAmount,
    isValid: true,
  };
}
