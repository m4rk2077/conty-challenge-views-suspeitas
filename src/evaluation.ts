import { classify } from './classifier.js';
import type { Dataset, Family } from './generator.js';
import type { Classification, Label } from './schema.js';
import { RULES_VERSION } from './rules.js';

export type Counts = Record<Classification, number>;
function counts(): Counts { return { legitimate: 0, suspicious: 0, indeterminate: 0 }; }
export function evaluateDataset(dataset: Dataset) {
  const matrix: Record<Label, Counts> = { legitimate: counts(), suspicious: counts() };
  const families: Partial<Record<Family, Counts>> = {};
  for (const example of dataset.examples) {
    const prediction = classify(example.series).classification;
    matrix[example.label][prediction]++;
    (families[example.family] ??= counts())[prediction]++;
  }
  const legitimateCount = Object.values(matrix.legitimate).reduce((sum, n) => sum + n, 0);
  const suspiciousCount = Object.values(matrix.suspicious).reduce((sum, n) => sum + n, 0);
  if (legitimateCount === 0 || suspiciousCount === 0) throw new Error('A avaliação exige exemplos das duas classes.');
  return {
    rules_version: RULES_VERSION,
    generator_version: dataset.generator_version,
    split: dataset.split,
    seed: dataset.seed,
    total: dataset.examples.length,
    legitimate_count: legitimateCount,
    suspicious_count: suspiciousCount,
    false_positives: matrix.legitimate.suspicious,
    false_positive_rate: matrix.legitimate.suspicious / legitimateCount,
    legitimate_abstentions: matrix.legitimate.indeterminate,
    legitimate_abstention_rate: matrix.legitimate.indeterminate / legitimateCount,
    suspicious_detection_rate: matrix.suspicious.suspicious / suspiciousCount,
    matrix,
    families
  };
}
export type Evaluation = ReturnType<typeof evaluateDataset>;

export function verifyReadmeMetrics(readme: string, evaluation: Evaluation): void {
  const expected: Record<string, string> = {
    FPR: evaluation.false_positive_rate.toFixed(6),
    LEGITIMATE_ABSTENTION: evaluation.legitimate_abstention_rate.toFixed(6),
    VALIDATION_SEED: String(evaluation.seed),
    VALIDATION_TOTAL: String(evaluation.total),
    RULES_VERSION: evaluation.rules_version
  };
  for (const [name, value] of Object.entries(expected)) {
    const match = new RegExp(`<!-- ${name}: ([^ ]+) -->`).exec(readme);
    if (!match || match[1] !== value) throw new Error(`README ${name}: publicado ${match?.[1] ?? 'ausente'}, medido ${value}.`);
  }
  const visible = `FPR medido: **${(evaluation.false_positive_rate * 100).toFixed(4)}% (${evaluation.false_positives}/${evaluation.legitimate_count})**`;
  const abstention = `Abstenção legítima: **${(evaluation.legitimate_abstention_rate * 100).toFixed(4)}% (${evaluation.legitimate_abstentions}/${evaluation.legitimate_count})**`;
  if (!readme.includes(visible) || !readme.includes(abstention)) throw new Error('O valor visível de FPR/abstenção do README diverge da avaliação.');
}
