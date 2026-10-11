import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { Dataset } from '../src/generator.js';
import { evaluateDataset } from '../src/evaluation.js';

const { values } = parseArgs({ options: { split: { type: 'string', default: 'validation' } } });
if (values.split !== 'development' && values.split !== 'validation') throw new Error('Split deve ser development ou validation.');
const dataset = JSON.parse(await readFile(`data/${values.split}.json`, 'utf8')) as Dataset;
console.log(JSON.stringify(evaluateDataset(dataset), null, 2));
