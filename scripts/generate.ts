import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { generateDataset, DATASET_CONFIG } from '../src/generator.js';

const { values } = parseArgs({ options: { seed: { type: 'string' } } });
const seed = values.seed === undefined ? DATASET_CONFIG.validationSeed : Number(values.seed);
if (seed === DATASET_CONFIG.developmentSeed) throw new Error('Seed de validação deve diferir da seed de desenvolvimento.');
await mkdir('data', { recursive: true });
for (const dataset of [
  generateDataset(DATASET_CONFIG.developmentSeed, DATASET_CONFIG.developmentCount, 'development'),
  generateDataset(seed, DATASET_CONFIG.validationCount, 'validation')
]) {
  const path = `data/${dataset.split}.json`;
  await writeFile(path, JSON.stringify(dataset) + '\n', 'utf8');
  console.log(`${path}: seed=${dataset.seed}, exemplos=${dataset.examples.length}`);
}
await mkdir('examples', { recursive: true });
const development = generateDataset(DATASET_CONFIG.developmentSeed, DATASET_CONFIG.developmentCount, 'development');
const examples = {
  viral: development.examples.find(example => example.family === 'organic_viral')!.series,
  bought: Array.from({ length: 48 }, (_, hour) => ({ timestamp: new Date(Date.UTC(2026, 5, 1) + hour * 3_600_000).toISOString(), views: hour === 16 ? 10000 : 100 })),
  short: [{ timestamp: '2026-06-01T10:00:00.000Z', views: 120 }, { timestamp: '2026-06-01T11:00:00.000Z', views: 180 }]
};
for (const [name, series] of Object.entries(examples)) {
  await writeFile(`examples/${name}.json`, JSON.stringify({ series }, null, 2) + '\n', 'utf8');
}
