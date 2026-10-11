import { describe, expect, it } from 'vitest';
import { classify } from '../src/classifier.js';
import { RULES_VERSION } from '../src/rules.js';
import { hourly, fill, viralValues } from './helpers.js';

describe('Decisão conservadora', () => {
  it('não acusa um pico orgânico plausível e acusa uma rajada comprada de igual amplitude', () => {
    expect(classify(hourly(viralValues(100, 90))).classification).toBe('legitimate');
    expect(classify(hourly([...fill(16, 100), 9000, ...fill(79, 100)])).classification).toBe('suspicious');
  });
  it.each([6, 7])('detecta platô mecânico na fronteira de %i horas', duration => {
    const result = classify(hourly([...fill(8, 20), ...fill(duration, 200), ...fill(10, 20)]));
    expect(result.classification).toBe('suspicious');
    expect(result.triggered_rules).toEqual(['mechanical_plateau']);
    expect(result.reason).toContain(`${duration} horas`);
  });
  it('cinco repetições ainda não satisfazem a regra mecânica', () => {
    expect(classify(hourly([...fill(8, 100), ...fill(5, 1000), ...fill(83, 100)])).classification).toBe('indeterminate');
  });
  it('cauda variável sustentada após salto abrupto mantém conflito sem acusação', () => {
    const result = classify(hourly([...fill(8, 100), 3000, 1700, 1400, 1600, 1300, 1500, 1200, ...fill(10, 100)]));
    expect(result.classification).toBe('indeterminate');
    expect(result.triggered_rules).toEqual(['conflicting_evidence']);
    expect(result.reason).toContain('evidência é conflitante');
  });
  it('conflito por concentração cita a concentração real, sem inventar salto, queda ou repetição', () => {
    const result = classify(hourly([...fill(8, 20), 40, 80, 160, 200, 60, 80, 60, 80, 60, 80, ...fill(6, 20)]));
    expect(result.classification).toBe('indeterminate');
    expect(result.triggered_rules).toEqual(['conflicting_evidence']);
    expect(result.signals.max_hourly_increase_ratio).toBe(2);
    expect(result.signals.max_hourly_drop_ratio).toBe(0.75);
    expect(result.signals.elevated_repeat_hours).toBe(1);
    expect(result.reason).toContain('concentração de 42.37%');
    expect(result.reason).not.toMatch(/salto de|queda de|horas repetidas/);
  });
  it.each([2, 23])('%i horas não bastam mesmo para uma rajada aparente', hours => {
    expect(classify(hourly([5000, ...fill(hours - 1, 100)])).classification).toBe('indeterminate');
  });
  it('24 horas e 1000 views satisfazem os limites de evidência', () => {
    const series = hourly([...fill(23, 40), 80]);
    expect(classify(series).classification).toBe('legitimate');
    series[23]!.views = 79;
    expect(classify(series).classification).toBe('indeterminate');
  });
  it('não acusa views orgânicas constantes nem conta zeros como repetição elevada', () => {
    expect(classify(hourly(fill(48, 100))).classification).toBe('legitimate');
    expect(classify(hourly(fill(48, 0))).classification).toBe('indeterminate');
  });
  it('pico no final sem cauda prefere não acusar', () => {
    expect(classify(hourly([...fill(23, 100), 10000])).classification).toBe('indeterminate');
  });
  it('pico isolado é insuficiente se concentração e colapso não confirmarem', () => {
    const result = classify(hourly([...fill(16, 100), 1200, ...fill(79, 100)]));
    expect(result.signals.concentration_4h).toBeLessThan(0.4);
    expect(result.classification).toBe('indeterminate');
  });
  it('é determinístico, expõe sinais usados e não altera a série', () => {
    const input = hourly(viralValues());
    const snapshot = structuredClone(input);
    expect(classify(input)).toEqual(classify(input));
    expect(classify(input).rules_version).toBe(RULES_VERSION);
    expect(input).toEqual(snapshot);
  });
});

describe('Perturbações controladas: a causalidade não é inferida só pela amplitude', () => {
  for (const baseline of [30, 200]) for (const amplitude of [12, 90]) for (const duration of [5, 9]) for (const onset of [12, 40]) for (const noise of [0.06, 0.22]) {
    it(`viral/rajada: base=${baseline}, amp=${amplitude}, rampa=${duration}, início=${onset}, ruído=${noise}`, () => {
      const viral = hourly(viralValues(baseline, amplitude, duration, onset, noise));
      const bought = hourly(Array.from({ length: 96 }, (_, hour) => Math.round(baseline * (hour === onset ? amplitude : 1) * (1 + noise * Math.sin(hour * 1.7)))));
      expect(classify(viral).classification).toBe('legitimate');
      expect(classify(bought).classification).toBe(amplitude === 12 ? 'indeterminate' : 'suspicious');
    });
  }
});
