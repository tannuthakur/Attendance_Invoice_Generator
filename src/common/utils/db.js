import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

// Undefined column / undefined table / table or function missing from PostgREST's schema cache.
const SCHEMA_OUT_OF_DATE = new Set(['42703', '42P01', '42883', 'PGRST202', 'PGRST204', 'PGRST205']);

/** Unwraps a supabase-js result, translating common Postgres errors into HTTP errors. */
export function unwrap({ data, error }, notFoundMessage) {
  if (error) {
    if (SCHEMA_OUT_OF_DATE.has(error.code)) {
      throw new ServiceUnavailableException(
        `Database schema is out of date (${error.message}). Run the latest SQL files in supabase/migrations.`,
      );
    }
    if (error.code === '23505') throw new ConflictException(error.details || 'Duplicate value');
    if (error.code === '23503') throw new BadRequestException(error.details || 'Referenced record does not exist');
    if (error.code === '23514' || error.code === '22P02' || error.code === '22007') {
      throw new BadRequestException(error.message);
    }
    if (error.code === 'PGRST116' && notFoundMessage) throw new NotFoundException(notFoundMessage);
    throw error;
  }
  if (notFoundMessage && (data === null || data === undefined)) throw new NotFoundException(notFoundMessage);
  return data;
}

export function paginate(page = 1, limit = 20) {
  const from = (page - 1) * limit;
  return { from, to: from + limit - 1 };
}

/** Reads every row of a query in pages (PostgREST caps responses at 1000 rows). Order the query deterministically. */
export async function fetchAll(buildQuery, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const data = unwrap(await buildQuery().range(from, from + pageSize - 1));
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

/** '%term%' for a PostgREST ilike filter, escaping characters meaningful inside or()/ilike. */
export const ilikeTerm = (search) => `%${search.trim().replace(/[%,()*\\]/g, (c) => `\\${c}`)}%`;
