import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

export function createDatabasePool(connectionString: string): Pool {
  return new Pool({ connectionString });
}

export function createDatabase(connectionString: string) {
  return drizzle(createDatabasePool(connectionString), { schema });
}
