import { SignJWT } from 'jose';
import { err, ok, type Result } from '@pouch/shared';

// Minimal structural types for the Magic admin client (so we can mock it in tests).
export interface MagicAdminLike {
  token: {
    validate(didToken: string): void; // throws on invalid
    decode(didToken: string): [string, { iss: string }];
  };
  users: {
    getMetadataByToken(didToken: string): Promise<{
      issuer: string | null;
      publicAddress: string | null;
      email: string | null;
    }>;
  };
}

export interface UserRepositoryLike {
  upsertByIssuer(input: { issuer: string; magicPublicKey: string; evmAddress: string; email?: string }): Promise<{ id: string; evmAddress: string | null }>;
}

export type AuthError =
  | { type: 'AUTH_INVALID_DID'; message: string }
  | { type: 'AUTH_METADATA_FAILED'; message: string };

export interface AuthSession {
  userId: string;
  evmAddress: string;
  jwt: string;
}

export class AuthService {
  constructor(
    private readonly magic: MagicAdminLike,
    private readonly users: UserRepositoryLike,
    private readonly jwtSecret: string,
  ) {}

  async handleCallback(didToken: string): Promise<Result<AuthSession, AuthError>> {
    // 1. Validate (throws on invalid)
    try {
      this.magic.token.validate(didToken);
    } catch (error) {
      return err({ type: 'AUTH_INVALID_DID', message: error instanceof Error ? error.message : 'DID token validation failed.' });
    }

    // 2. Fetch metadata (issuer, publicAddress, email)
    let metadata: { issuer: string | null; publicAddress: string | null; email: string | null };
    try {
      metadata = await this.magic.users.getMetadataByToken(didToken);
    } catch (error) {
      return err({ type: 'AUTH_METADATA_FAILED', message: error instanceof Error ? error.message : 'Failed to fetch Magic metadata.' });
    }

    if (!metadata.issuer || !metadata.publicAddress) {
      return err({ type: 'AUTH_INVALID_DID', message: 'Magic metadata is missing issuer or publicAddress.' });
    }

    // 3. Upsert user by issuer
    const user = await this.users.upsertByIssuer({
      issuer: metadata.issuer,
      magicPublicKey: metadata.publicAddress,
      evmAddress: metadata.publicAddress,
      ...(metadata.email ? { email: metadata.email } : {}),
    });

    // 4. Mint our own session JWT (HS256, 24h)
    const secret = new TextEncoder().encode(this.jwtSecret);
    const jwt = await new SignJWT({ sub: user.id, evmAddress: user.evmAddress ?? metadata.publicAddress })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    return ok({
      userId: user.id,
      evmAddress: user.evmAddress ?? metadata.publicAddress,
      jwt,
    });
  }
}
