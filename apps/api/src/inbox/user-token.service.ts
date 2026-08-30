import jwt from 'jsonwebtoken';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import type { EndUserContext } from '../common/request-context';

export interface EndUserTokenClaims {
  sub: string;
  tenant_id: string;
  external_user_id: string;
  typ: 'end_user';
}

// Pure so it can be unit tested without a live database: a dashboard-typed JWT is
// signed with the same JWT_SECRET, so `typ` is the only thing distinguishing the two.
export function assertEndUserTokenClaims(payload: unknown): asserts payload is EndUserTokenClaims {
  if (!payload || typeof payload !== 'object') throw new Error('Token payload is malformed.');
  const candidate = payload as Record<string, unknown>;
  if (candidate.typ !== 'end_user') throw new Error('Token is not an end-user inbox token.');
  if (typeof candidate.sub !== 'string' || typeof candidate.tenant_id !== 'string' || typeof candidate.external_user_id !== 'string') {
    throw new Error('Token payload is missing required end-user claims.');
  }
}

export class UserTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async mint(tenantId: string, externalUserId: string): Promise<{ token: string; expires_at: Date }> {
    const user = await this.prisma.user.findFirst({ where: { tenantId, externalId: externalUserId } });
    if (!user) throw new ApiError('USER_NOT_FOUND', 'The target user does not exist for this tenant.', 404);
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new ApiError('SERVER_MISCONFIGURED', 'End-user authentication is not configured.', 503);
    const expiresIn = (process.env.USER_TOKEN_EXPIRES_IN ?? '1h') as jwt.SignOptions['expiresIn'];
    const claims: EndUserTokenClaims = { sub: user.id, tenant_id: tenantId, external_user_id: user.externalId, typ: 'end_user' };
    const token = jwt.sign(claims, secret, { expiresIn });
    const decoded = jwt.decode(token) as { exp?: number } | null;
    const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 3_600_000);
    return { token, expires_at: expiresAt };
  }

  async verify(token: string): Promise<EndUserContext> {
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('missing JWT secret');
      const payload = jwt.verify(token, secret);
      assertEndUserTokenClaims(payload);
      // Mirrors AuthService.verifyToken: re-check the user still exists and the tenant is
      // still ACTIVE on every request rather than trusting a token minted minutes ago.
      const user = await this.prisma.user.findFirst({ where: { id: payload.sub, tenantId: payload.tenant_id, status: 'ACTIVE', tenant: { status: 'ACTIVE' } } });
      if (!user) throw new Error('user unavailable');
      return { id: user.id, tenantId: user.tenantId, externalId: user.externalId };
    } catch {
      throw new ApiError('INVALID_TOKEN', 'The access token is invalid or expired.', 401);
    }
  }
}
