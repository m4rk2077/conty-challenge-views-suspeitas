import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT deve ser inteiro entre 1 e 65535.');
const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, info => {
  console.log(`API em http://127.0.0.1:${info.port} (Node ${process.versions.node})`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { server.close(); });
