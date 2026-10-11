import { describe, expect, it } from 'vitest';
import { extractSignals } from '../src/signals.js';
import { hourly, fill } from './helpers.js';

describe('Sinais calculados a partir das views novas por hora', () => {
  it('mede o baseline pela mediana das primeiras oito horas', () => {
    const s = extractSignals(hourly([10, 30, 20, 40, 10, 20, 30, 1000, 2000, 100]));
    expect(s.baseline_first_8h).toBe(25);
    expect(s.peak_to_baseline).toBe(80);
    expect(s.peak_hour_index).toBe(8);
  });
  it('mede a maior janela de quatro horas e o total, incluindo janela final', () => {
    const s = extractSignals(hourly([1, 2, 3, 4, 100]));
    expect(s.total_views).toBe(110);
    expect(s.concentration_4h).toBe(109 / 110);
  });
  it('mede salto e queda horários sem dividir por zero', () => {
    const s = extractSignals(hourly([0, 100, 10, 0]));
    expect(s.max_hourly_increase_ratio).toBe(100);
    expect(s.max_hourly_drop_ratio).toBe(1);
  });
  it('mede retenção e CV das seis horas seguintes ao pico', () => {
    const s = extractSignals(hourly([...fill(8, 10), 100, 20, 40, 20, 40, 20, 40]));
    expect(s.post_peak_retention).toBe(0.3);
    expect(s.post_peak_cv).toBeCloseTo(1 / 3);
  });
  it.each([6, 7])('mede a cauda após o fim do platô de %i horas', hours => {
    const s = extractSignals(hourly([...fill(8, 20), ...fill(hours, 200), ...fill(10, 20)]));
    expect(s.elevated_repeat_hours).toBe(hours);
    expect(s.peak_end_hour_index).toBe(7 + hours);
    expect(s.post_peak_retention).toBe(0.1);
    expect(s.post_peak_cv).toBe(0);
  });
  it('não chama séries constantes de platô elevado', () => {
    const s = extractSignals(hourly(fill(48, 500)));
    expect(s.elevated_repeat_hours).toBe(0);
    expect(s.peak_to_baseline).toBe(1);
  });
  it('exige igualdade consecutiva e valor elevado para repetição mecânica', () => {
    const s = extractSignals(hourly([...fill(8, 10), 100, 100, 101, 100, 100, 100, ...fill(8, 10)]));
    expect(s.elevated_repeat_hours).toBe(3);
  });
  it('série sem cauda suficiente devolve null, não zero de evidência fabricada', () => {
    expect(extractSignals(hourly([...fill(12, 100), 1000, 500])).post_peak_retention).toBeNull();
  });
  it('série zerada mantém sinais finitos e cauda indisponível', () => {
    const s = extractSignals(hourly(fill(24, 0)));
    expect(s.total_views).toBe(0);
    expect(s.concentration_4h).toBe(0);
    expect(s.post_peak_retention).toBeNull();
    expect(s.post_peak_cv).toBeNull();
    expect(s.peak_to_baseline).toBe(0);
  });
  it('não altera a entrada', () => {
    const series = hourly([10, 100, 20]);
    const snapshot = structuredClone(series);
    extractSignals(series);
    expect(series).toEqual(snapshot);
  });
});
