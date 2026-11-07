export function mapRow<T>(row: unknown): T | null {
  if (!row || typeof row !== 'object') return null;
  return row as unknown as T;
}

export function mapRows<T>(rows: unknown[]): T[] {
  if (!Array.isArray(rows)) return [];
  return rows as unknown as T[];
}

