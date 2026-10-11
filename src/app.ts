import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { classify } from './classifier.js';
import { InputError } from './schema.js';
import { RULES_VERSION } from './rules.js';

export const app = new Hono();
app.get('/health', c => c.json({ status: 'ok', node: process.versions.node, rules_version: RULES_VERSION }));
app.use('/classify', bodyLimit({ maxSize: 100_000, onError: c => c.json({ error: 'Corpo excede 100000 bytes.' }, 413) }));
app.post('/classify', async c => {
  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ error: 'JSON inválido.', field: 'body' }, 400); }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'Informe um objeto com series.', field: 'body' }, 400);
  }
  try { return c.json(classify((body as Record<string, unknown>).series)); }
  catch (error) {
    if (error instanceof InputError) return c.json({ error: error.message, field: error.field }, 400);
    throw error;
  }
});
