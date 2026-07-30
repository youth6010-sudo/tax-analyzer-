import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type Db = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | null = null;
let database: Db | null = null;

export function getDb(): Db {
  if (database) return database;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const isServerless = Boolean(process.env.VERCEL);
  // Neon pooler(transaction)에서는 connection startup 파라미터(statement_timeout 등)가
  // 연결 고착/지연을 유발할 수 있어 넣지 않는다.
  client = postgres(connectionString, {
    max: isServerless ? 3 : 10,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  database = drizzle(client, { schema });
  return database;
}

export { schema };
