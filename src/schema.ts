export interface HourPoint { timestamp: string; views: number }
export type Classification = 'legitimate' | 'suspicious' | 'indeterminate';
export type Label = Exclude<Classification, 'indeterminate'>;
export const INPUT_LIMITS = Object.freeze({ minHours: 2, maxHours: 720, maxHourlyViews: 1_000_000_000 });

export class InputError extends Error {
  constructor(public readonly field: string, message: string) { super(message); }
}

export function validateSeries(input: unknown): HourPoint[] {
  if (!Array.isArray(input) || input.length < INPUT_LIMITS.minHours || input.length > INPUT_LIMITS.maxHours) {
    throw new InputError('series', 'Informe de 2 a 720 pontos horários consecutivos.');
  }
  let previous: number | undefined;
  return input.map((point: unknown, index: number) => {
    const field = `series[${index}]`;
    if (point === null || typeof point !== 'object' || Array.isArray(point)) {
      throw new InputError(field, 'Cada ponto deve ser um objeto com timestamp e views.');
    }
    const { timestamp, views } = point as Record<string, unknown>;
    if (typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/.test(timestamp)) {
      throw new InputError(`${field}.timestamp`, 'Use UTC canônico YYYY-MM-DDTHH:00:00.000Z.');
    }
    const time = Date.parse(timestamp);
    if (!Number.isFinite(time) || new Date(time).toISOString() !== timestamp) {
      throw new InputError(`${field}.timestamp`, 'Data ou hora inválida.');
    }
    if (previous !== undefined && time - previous !== 3_600_000) {
      throw new InputError(`${field}.timestamp`, 'As horas devem crescer em intervalos de uma hora, sem lacunas ou duplicatas.');
    }
    if (typeof views !== 'number' || !Number.isSafeInteger(views) || views < 0 || views > INPUT_LIMITS.maxHourlyViews) {
      throw new InputError(`${field}.views`, 'Views novas naquela hora devem ser inteiras entre 0 e 1000000000.');
    }
    previous = time;
    return { timestamp, views };
  });
}
