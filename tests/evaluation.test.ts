import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Dataset } from '../src/generator.js';
import { evaluateDataset, verifyReadmeMetrics } from '../src/evaluation.js';
import { classify } from '../src/classifier.js';
import { fill, hourly } from './helpers.js';

function synthetic(label: 'legitimate' | 'suspicious', values: number[], id: string): Dataset['examples'][number] {
  return { id, label, family: label === 'legitimate' ? 'organic_stable' : 'bought_burst', parameters: { hours: values.length, baseline: 100, amplitude: 50, onset: 12, duration: 1, noise: 0, ramp_hours: 0, decay_hours: 0, seasonal_phase: 0 }, series: hourly(values) };
}

describe('Avaliação da mesma função usada pela API', () => {
  it('calcula FP e abstenção em denominadores separados, sem excluir abstenções do FPR', () => {
    const dataset: Dataset = { generator_version: '1', split: 'validation', seed: 10, samples_per_family: 1, examples: [
      synthetic('legitimate', fill(48, 100), 'honesto'),
      synthetic('legitimate', [120, 180], 'curto'),
      synthetic('legitimate', [...fill(12, 100), 10000, ...fill(35, 100)], 'orgânico-com-forma-ambígua'),
      synthetic('suspicious', [...fill(12, 100), 10000, ...fill(35, 100)], 'comprado')
    ] };
    const measured = evaluateDataset(dataset);
    expect(measured.false_positives).toBe(1);
    expect(measured.legitimate_count).toBe(3);
    expect(measured.false_positive_rate).toBe(1 / 3);
    expect(measured.legitimate_abstention_rate).toBe(1 / 3);
    expect(measured.matrix.suspicious.suspicious).toBe(1);
  });
  it('recusa taxa sem denominador de ambas as classes', () => {
    expect(() => evaluateDataset({ generator_version: '1', split: 'validation', seed: 1, samples_per_family: 1, examples: [] })).toThrow('duas classes');
  });
  it('a matriz e as contagens por família são as predições reais, inclusive erros', () => {
    const dataset = JSON.parse(readFileSync('data/validation.json', 'utf8')) as Dataset;
    const evaluation = evaluateDataset(dataset);
    for (const label of ['legitimate', 'suspicious'] as const) for (const prediction of ['legitimate', 'suspicious', 'indeterminate'] as const) {
      expect(evaluation.matrix[label][prediction]).toBe(dataset.examples.filter(e => e.label === label && classify(e.series).classification === prediction).length);
    }
    expect(Object.values(evaluation.families).reduce((sum, row) => sum + Object.values(row).reduce((a, b) => a + b, 0), 0)).toBe(dataset.examples.length);
  });
});

describe('Contrato real das métricas publicadas no README', () => {
  const dataset = JSON.parse(readFileSync('data/validation.json', 'utf8')) as Dataset;
  const evaluation = evaluateDataset(dataset);
  const readme = readFileSync('README.md', 'utf8');
  it('README publica o FPR e a abstenção medidos no dataset real', () => {
    expect(() => verifyReadmeMetrics(readme, evaluation)).not.toThrow();
  });
  it('controle negativo: modificar o número FPR do README faz a verificação falhar', () => {
    const changed = readme.replace(/<!-- FPR: [^ ]+ -->/, `<!-- FPR: ${(evaluation.false_positive_rate + 0.01).toFixed(6)} -->`);
    expect(changed).not.toBe(readme);
    expect(() => verifyReadmeMetrics(changed, evaluation)).toThrow('README FPR');
  });
  it('também detecta número visível errado mesmo se o marcador oculto for correto', () => {
    const changed = readme.replace(/FPR medido: \*\*[^*]+\*\*/, 'FPR medido: **99.0000% (99/100)**');
    expect(changed).not.toBe(readme);
    expect(() => verifyReadmeMetrics(changed, evaluation)).toThrow('valor visível');
  });
});
