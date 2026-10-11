import { validateSeries, type Classification } from './schema.js';
import { extractSignals, type Signals } from './signals.js';
import { RULES, RULES_VERSION } from './rules.js';

export interface Decision {
  classification: Classification;
  reason: string;
  signals: Signals;
  triggered_rules: string[];
  rules_version: string;
}

export function classify(input: unknown): Decision {
  const signals = extractSignals(validateSeries(input));
  const s = signals;
  const result = (classification: Classification, reason: string, ...triggered_rules: string[]): Decision =>
    ({ classification, reason, signals, triggered_rules, rules_version: RULES_VERSION });
  if (s.sample_hours < RULES.minHours || s.total_views < RULES.minTotalViews) {
    return result('indeterminate', `A série tem ${s.sample_hours} horas e ${s.total_views} views; são necessárias pelo menos ${RULES.minHours} horas e ${RULES.minTotalViews} views para avaliar os padrões.`, 'insufficient_evidence');
  }
  const highPeak = s.peak_to_baseline >= RULES.highPeakRatio;
  const abruptRise = s.max_hourly_increase_ratio >= RULES.abruptRiseRatio;
  const abruptDrop = s.max_hourly_drop_ratio >= RULES.abruptDropRatio;
  const concentrated = s.concentration_4h >= RULES.highConcentration;
  const mechanical = s.elevated_repeat_hours >= RULES.mechanicalRunHours;
  const naturalTail = s.post_peak_retention !== null && s.post_peak_retention >= RULES.sustainedRetention
    && s.post_peak_cv !== null && s.post_peak_cv >= RULES.naturalTailCv;
  const warning = highPeak && (abruptRise || abruptDrop || concentrated || mechanical);
  if (warning && naturalTail) {
    const alerts: string[] = [];
    if (abruptRise) alerts.push(`salto de ${s.max_hourly_increase_ratio.toFixed(2)} vezes`);
    if (abruptDrop) alerts.push(`queda de ${(s.max_hourly_drop_ratio * 100).toFixed(2)}%`);
    if (concentrated) alerts.push(`concentração de ${(s.concentration_4h * 100).toFixed(2)}% em quatro horas`);
    if (mechanical) alerts.push(`${s.elevated_repeat_hours} horas repetidas com valor elevado`);
    return result('indeterminate', `O pico é ${s.peak_to_baseline.toFixed(2)} vezes o baseline, com ${alerts.join('; ')}, mas a cauda mantém ${(s.post_peak_retention! * 100).toFixed(2)}% do pico com variação. A evidência é conflitante; não há base para acusar.`, 'conflicting_evidence');
  }
  if (highPeak && abruptRise && mechanical) {
    return result('suspicious', `Foram ${s.elevated_repeat_hours} horas consecutivas com o mesmo valor elevado, um pico de ${s.peak_to_baseline.toFixed(2)} vezes o baseline e um salto horário de ${s.max_hourly_increase_ratio.toFixed(2)} vezes. A combinação sugere repetição mecânica.`, 'mechanical_plateau');
  }
  if (highPeak && abruptRise && abruptDrop && concentrated
    && s.post_peak_retention !== null && s.post_peak_retention <= RULES.collapsedRetention) {
    return result('suspicious', `${(s.concentration_4h * 100).toFixed(2)}% das views estão em quatro horas; o pico é ${s.peak_to_baseline.toFixed(2)} vezes o baseline, com salto de ${s.max_hourly_increase_ratio.toFixed(2)} vezes, queda de ${(s.max_hourly_drop_ratio * 100).toFixed(2)}% e retenção de apenas ${(s.post_peak_retention * 100).toFixed(2)}% nas seis horas seguintes. A combinação sugere uma rajada artificial.`, 'concentrated_collapse');
  }
  if (warning || (highPeak && s.post_peak_retention === null)) {
    return result('indeterminate', `O pico é ${s.peak_to_baseline.toFixed(2)} vezes o baseline, mas os sinais disponíveis não formam uma combinação suficiente para separar impulso legítimo de artificial.`, 'unresolved_surge');
  }
  if (highPeak && naturalTail) {
    return result('legitimate', `O pico é ${s.peak_to_baseline.toFixed(2)} vezes o baseline, cresceu sem salto abrupto e mantém ${(s.post_peak_retention! * 100).toFixed(2)}% nas seis horas seguintes com variação. É compatível com um viral orgânico.`, 'sustained_viral');
  }
  return result('legitimate', 'A série não combina pico elevado com salto, concentração, colapso ou repetição mecânica suficientes para levantar suspeita. É compatível com atividade orgânica.', 'no_combined_anomaly');
}
