import { eq } from 'drizzle-orm';

import type { createDatabase } from '../client';
import { users } from '../schema';

type Database = ReturnType<typeof createDatabase>;

export interface UpsertUserInput {
  issuer: string;
  magicPublicKey: string;
  evmAddress: string;
  email?: string;
}

export interface UserRecord {
  id: string;
  issuer: string | null;
  magicPublicKey: string | null;
  evmAddress: string | null;
  email: string | null;
}

function mapRowToUser(row: typeof users.$inferSelect): UserRecord {
  return {
    id: row.id,
    issuer: row.issuer,
    magicPublicKey: row.magicPublicKey,
    evmAddress: row.evmAddress,
    email: row.email,
  };
}

export class DrizzleUserRepository {
  constructor(private readonly db: Database) {}

  async findByIssuer(issuer: string): Promise<UserRecord | null> {
    const [row] = await this.db.select().from(users).where(eq(users.issuer, issuer)).limit(1);
    return row ? mapRowToUser(row) : null;
  }

  async findByEvmAddress(evmAddress: string): Promise<UserRecord | null> {
    const [row] = await this.db.select().from(users).where(eq(users.evmAddress, evmAddress)).limit(1);
    return row ? mapRowToUser(row) : null;
  }

  async upsertByIssuer(input: UpsertUserInput): Promise<UserRecord> {
    // Upsert keyed on issuer (the Magic DID is the canonical durable identifier).
    const existing = await this.findByIssuer(input.issuer);

    if (existing) {
      const [updated] = await this.db
        .update(users)
        .set({
          magicPublicKey: input.magicPublicKey,
          evmAddress: input.evmAddress,
          ...(input.email ? { email: input.email } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning();

      return mapRowToUser(updated!);
    }

    const [inserted] = await this.db
      .insert(users)
      .values({
        issuer: input.issuer,
        magicPublicKey: input.magicPublicKey,
        evmAddress: input.evmAddress,
        ...(input.email ? { email: input.email } : {}),
      })
      .returning();

    return mapRowToUser(inserted!);
  }
}
