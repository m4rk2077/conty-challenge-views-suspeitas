import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { classify } from '../dist/classifier.js';

const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['dist/server.js'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('API não iniciou em 5s.')), 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`API saiu prematuramente: ${code}`)); });
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('API em')) { clearTimeout(timer); resolve(); }
    });
  });
  const health = await (await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) })).json();
  assert.match(health.node, /^22\./);
  console.log(`HTTP real: Node ${health.node}, regras ${health.rules_version}`);
  for (const [name, expected] of [['viral', 'legitimate'], ['bought', 'suspicious'], ['short', 'indeterminate']]) {
    const body = await readFile(`examples/${name}.json`, 'utf8');
    const response = await fetch(`${base}/classify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    const decision = await response.json();
    assert.equal(decision.classification, expected);
    assert.deepEqual(decision, classify(JSON.parse(body).series));
    console.log(`${name}: ${decision.classification} — ${decision.reason}`);
    if (name === 'short') console.log(JSON.stringify(decision, null, 2));
  }
  const invalid = await fetch(`${base}/classify`, { method: 'POST', body: '{', signal: AbortSignal.timeout(5000) });
  assert.equal(invalid.status, 400);
  console.log('JSON inválido: HTTP 400');
} finally {
  const exited = once(child, 'exit');
  child.kill();
  await Promise.race([exited, new Promise(resolve => { const timer = setTimeout(resolve, 3000); timer.unref(); })]);
}
