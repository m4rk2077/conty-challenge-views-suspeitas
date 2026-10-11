import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateDataset, DATASET_CONFIG, FAMILIES, type Dataset } from '../src/generator.js';
import { validateSeries } from '../src/schema.js';
import { classify } from '../src/classifier.js';

describe('Gerador independente e reproduzível', () => {
  it('mesma seed produz exatamente o mesmo JSON', () => {
    expect(JSON.stringify(generateDataset(42, 3, 'validation'))).toBe(JSON.stringify(generateDataset(42, 3, 'validation')));
  });
  it('seeds diferentes mudam parâmetros e séries', () => {
    expect(generateDataset(42, 2, 'validation').examples[0]!.series).not.toEqual(generateDataset(43, 2, 'validation').examples[0]!.series);
  });
  it.each([-1, 0.5, 4294967296, NaN])('rejeita seed inválida %s', seed => {
    expect(() => generateDataset(seed, 1, 'validation')).toThrow('Seed');
  });
  it.each([0, 101, 1.5])('rejeita quantidade inválida %s', count => {
    expect(() => generateDataset(1, count, 'validation')).toThrow('exemplos');
  });
  it('mantém família causal, rótulos e séries válidas sem consultar predições', () => {
    const dataset = generateDataset(123, 4, 'validation');
    expect(dataset.examples).toHaveLength(FAMILIES.length * 4);
    expect(new Set(dataset.examples.map(x => x.id)).size).toBe(dataset.examples.length);
    for (const example of dataset.examples) {
      expect(example.label).toBe(FAMILIES.find(f => f.name === example.family)!.label);
      expect(validateSeries(example.series)).toEqual(example.series);
      if (example.family === 'mechanical_plateau') {
        const plateau = example.series.slice(example.parameters.onset, example.parameters.onset + example.parameters.duration);
        expect(new Set(plateau.map(x => x.views)).size).toBe(1);
        expect(plateau[0]!.views).toBeGreaterThan(example.parameters.baseline * 10);
      }
      if (example.family === 'organic_viral') {
        const p = example.parameters;
        expect(example.series[p.onset + p.ramp_hours + 6]!.views).toBeGreaterThan(p.baseline * 3);
      }
    }
  });
  it('as perturbações variam amplitude, duração, ruído e posição', () => {
    const examples = generateDataset(DATASET_CONFIG.developmentSeed, 20, 'development').examples;
    for (const key of ['amplitude', 'duration', 'noise', 'onset'] as const) {
      expect(new Set(examples.map(x => x.parameters[key])).size).toBeGreaterThan(4);
    }
  });
  it('os dois arquivos publicados são exatamente reproduzíveis e usam seeds separadas', () => {
    expect(DATASET_CONFIG.developmentSeed).not.toBe(DATASET_CONFIG.validationSeed);
    for (const [split, seed, count] of [
      ['development', DATASET_CONFIG.developmentSeed, DATASET_CONFIG.developmentCount],
      ['validation', DATASET_CONFIG.validationSeed, DATASET_CONFIG.validationCount]
    ] as const) {
      const file = readFileSync(`data/${split}.json`, 'utf8');
      expect(file).toBe(JSON.stringify(generateDataset(seed, count, split)) + '\n');
    }
  });
  it('famílias virais e mecânicas são distintas em todo desenvolvimento, incluindo variações', () => {
    const dataset = JSON.parse(readFileSync('data/development.json', 'utf8')) as Dataset;
    for (const example of dataset.examples) {
      if (example.family === 'organic_viral') expect(classify(example.series).classification).toBe('legitimate');
      if (example.family === 'mechanical_plateau') expect(classify(example.series).classification).toBe('suspicious');
    }
  });
});
