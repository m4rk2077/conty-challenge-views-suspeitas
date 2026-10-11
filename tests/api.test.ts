import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { classify } from '../src/classifier.js';
import { hourly, fill, viralValues } from './helpers.js';

function post(body: unknown) { return app.request('/classify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
describe('API', () => {
  it('health comprova Node 22 e versão das regras', async () => {
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    expect((await response.json()).node).toMatch(/^22\./);
  });
  it.each([viralValues(), [...fill(12, 100), 5000, ...fill(20, 100)], [120, 180]].map(values => ({ values })))('usa exatamente o mesmo classificador puro', async ({ values }) => {
    const series = hourly(values);
    const response = await post({ series });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(classify(series));
  });
  it.each([
    ['body', null], ['body', []], ['series', {}], ['series', { series: [] }],
    ['series', { series: hourly([1]) }], ['series', { series: hourly(fill(721, 1)) }],
    ['series[0]', { series: [null, { timestamp: '2026-06-01T01:00:00.000Z', views: 1 }] }],
    ...[-1, 1.5, '10', null, 1000000001, Number.MAX_SAFE_INTEGER].map(views => ['series[0].views', { series: [{ timestamp: '2026-06-01T00:00:00.000Z', views }, { timestamp: '2026-06-01T01:00:00.000Z', views: 1 }] }]),
    ...['2026-02-30T00:00:00.000Z', '2026-06-01', '2026-06-01T00:00:00', '2026-06-01T24:00:00.000Z', '2026-06-01T00:30:00.000Z'].map(timestamp => ['series[0].timestamp', { series: [{ timestamp, views: 1 }, { timestamp: '2026-06-01T01:00:00.000Z', views: 1 }] }]),
    ...['2026-06-01T00:00:00.000Z', '2026-06-01T02:00:00.000Z', '2026-05-31T23:00:00.000Z'].map(timestamp => ['series[1].timestamp', { series: [{ timestamp: '2026-06-01T00:00:00.000Z', views: 1 }, { timestamp, views: 1 }] }])
  ] as [string, unknown][])('rejeita entrada inválida com campo %s', async (field, body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect((await response.json()).field).toBe(field);
  });
  it('rejeita JSON inválido', async () => {
    const response = await app.request('/classify', { method: 'POST', body: '{' });
    expect(response.status).toBe(400);
    expect((await response.json()).field).toBe('body');
  });
  it('aceita os limites de 720 horas e um bilhão de views/hora', async () => {
    expect((await post({ series: hourly(fill(720, 1000000000)) })).status).toBe(200);
  });
  it('limita o corpo HTTP', async () => {
    expect((await app.request('/classify', { method: 'POST', body: 'x'.repeat(100001) })).status).toBe(413);
  });
});
