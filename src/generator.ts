import type { HourPoint, Label } from './schema.js';

// Labels describe the simulated cause, before any curve is produced.
// This module never imports the classifier, its signals, or its thresholds.
export const FAMILIES = [
  { name: 'organic_stable', label: 'legitimate' },
  { name: 'organic_growth', label: 'legitimate' },
  { name: 'organic_seasonal', label: 'legitimate' },
  { name: 'organic_viral', label: 'legitimate' },
  { name: 'organic_flash', label: 'legitimate' },
  { name: 'organic_low_count', label: 'legitimate' },
  { name: 'bought_burst', label: 'suspicious' },
  { name: 'mechanical_plateau', label: 'suspicious' },
  { name: 'abrupt_collapse', label: 'suspicious' },
  { name: 'smooth_boost', label: 'suspicious' }
] as const satisfies readonly { name: string; label: Label }[];
export type Family = typeof FAMILIES[number]['name'];
export interface Parameters {
  hours: number;
  baseline: number;
  amplitude: number;
  onset: number;
  duration: number;
  noise: number;
  ramp_hours: number;
  decay_hours: number;
  seasonal_phase: number;
}
export interface Example {
  id: string;
  family: Family;
  label: Label;
  parameters: Parameters;
  series: HourPoint[];
}
export interface Dataset {
  generator_version: string;
  split: 'development' | 'validation';
  seed: number;
  samples_per_family: number;
  examples: Example[];
}
export const DATASET_CONFIG = Object.freeze({ developmentSeed: 20261001, validationSeed: 20261009, developmentCount: 20, validationCount: 40 });

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDataset(seed: number, samplesPerFamily: number, split: Dataset['split']): Dataset {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new Error('Seed deve ser uint32.');
  if (!Number.isInteger(samplesPerFamily) || samplesPerFamily < 1 || samplesPerFamily > 100) throw new Error('Use de 1 a 100 exemplos por família.');
  const random = seededRandom(seed);
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const examples: Example[] = [];
  for (const { name: family, label } of FAMILIES) {
    for (let index = 0; index < samplesPerFamily; index++) {
      const hours = random() < 0.5 ? 72 : 96;
      const parameters: Parameters = {
        hours,
        baseline: family === 'organic_low_count' ? integer(1, 9) : integer(30, 220),
        amplitude: integer(12, 90),
        onset: integer(12, hours - 32),
        duration: family === 'mechanical_plateau' ? integer(8, 18) : family === 'organic_flash' ? integer(1, 3) : integer(1, 5),
        noise: 0.06 + random() * 0.22,
        ramp_hours: family === 'organic_flash' ? integer(0, 3) : integer(5, 9),
        decay_hours: integer(10, 20),
        seasonal_phase: integer(0, 23)
      };
      const p = parameters;
      const series: HourPoint[] = [];
      const plateau = Math.round(p.baseline * p.amplitude);
      for (let hour = 0; hour < hours; hour++) {
        const t = hour - p.onset;
        let level = p.baseline;
        let noisy = true;
        if (family === 'organic_growth') level *= 1 + 3 * hour / (hours - 1);
        if (family === 'organic_seasonal') level *= 1 + 0.65 * Math.sin(2 * Math.PI * (hour + p.seasonal_phase) / 24);
        if (family === 'organic_viral' || family === 'smooth_boost') {
          if (t >= 0 && t < p.ramp_hours) level *= p.amplitude ** ((t + 1) / p.ramp_hours);
          if (t >= p.ramp_hours) level += p.baseline * (p.amplitude - 1) * Math.exp(-(t - p.ramp_hours + 1) / p.decay_hours);
        }
        if (family === 'organic_flash') {
          if (t >= 0 && t < p.ramp_hours) level *= p.amplitude ** ((t + 1) / (p.ramp_hours + 1));
          if (t >= p.ramp_hours && t < p.ramp_hours + p.duration) level *= p.amplitude;
        }
        if (family === 'bought_burst' && t >= 0 && t < p.duration) level *= p.amplitude;
        if (family === 'mechanical_plateau' && t >= 0 && t < p.duration) { level = plateau; noisy = false; }
        if (family === 'abrupt_collapse' && t >= 0 && t < p.duration + 3) level *= p.amplitude * (0.8 + 0.2 * t / (p.duration + 2));
        const views = Math.max(0, Math.round(level * (noisy ? 1 + (random() * 2 - 1) * p.noise : 1)));
        series.push({ timestamp: new Date(Date.UTC(2026, 5, 1) + hour * 3_600_000).toISOString(), views });
      }
      examples.push({ id: `${split}-${family}-${index + 1}`, family, label, parameters, series });
    }
  }
  return { generator_version: '1', split, seed, samples_per_family: samplesPerFamily, examples };
}
