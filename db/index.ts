import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type Db = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | null = null;
let database: Db | null = null;

/** 느린 쿼리가 커넥션을 영구 점유하지 않도록 (ms). 클라이언트 fetch 타임아웃과 맞춤. */
const STATEMENT_TIMEOUT_MS = 20_000;

export function getDb(): Db {
  if (database) return database;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const isServerless = Boolean(process.env.VERCEL);
  client = postgres(connectionString, {
    max: isServerless ? 3 : 10,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: {
      statement_timeout: STATEMENT_TIMEOUT_MS,
    },
  });
  database = drizzle(client, { schema });
  return database;
}

export { schema };
