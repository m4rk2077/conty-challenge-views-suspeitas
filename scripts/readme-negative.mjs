import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const path = 'README.md';
const original = readFileSync(path, 'utf8');
const changed = original.replace(/FPR medido: \*\*[^*]+\*\*/, 'FPR medido: **99.0000% (99/100)**');
if (changed === original) throw new Error('Número visível não encontrado no README.');
try {
  writeFileSync(path, changed, 'utf8');
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/evaluation.test.ts', '-t', 'README publica o FPR'], { encoding: 'utf8', windowsHide: true });
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  if (result.status !== 1 || !output.includes('valor visível')) throw new Error(`Controle negativo não falhou pelo motivo esperado.\n${output}`);
  console.log('Com FPR visível adulterado para 99%, o teste real de README falhou (exit 1; valor visível diverge da avaliação).');
} finally {
  writeFileSync(path, original, 'utf8');
}
if (readFileSync(path, 'utf8') !== original) throw new Error('README não foi restaurado.');
console.log('README original restaurado byte a byte.');
