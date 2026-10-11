export const RULES_VERSION = '1';
export const RULES = Object.freeze({
  minHours: 24,
  minTotalViews: 1_000,
  baselineHours: 8,
  concentrationWindow: 4,
  retentionHours: 6,
  elevatedFloor: 20,
  elevatedBaselineMultiple: 3,
  highPeakRatio: 8,
  abruptRiseRatio: 6,
  abruptDropRatio: 0.85,
  highConcentration: 0.4,
  collapsedRetention: 0.15,
  sustainedRetention: 0.25,
  naturalTailCv: 0.05,
  mechanicalRunHours: 6
});
