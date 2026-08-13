import { Injectable } from '@nestjs/common';
import { ApiKeyStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import type { ApiClientContext } from '../common/request-context';

const VALID_PERMISSIONS = new Set(['events:write', 'notifications:read', 'notifications:write', 'templates:read', 'templates:write', 'analytics:read', 'webhooks:manage', 'workflows:manage', 'users:manage', 'devices:manage']);

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private hash(rawKey: string): string {
    const pepper = this.config.get<string>('API_KEY_PEPPER');
    if (!pepper || pepper.length < 24) throw new ApiError('SERVER_MISCONFIGURED', 'API key authentication is not configured.', 503);
    return createHash('sha256').update(`${pepper}:${rawKey}`).digest('hex');
  }

  async authenticate(rawKey: string): Promise<ApiClientContext> {
    if (!/^nk_(test|live)_[A-Za-z0-9_-]{24,}$/.test(rawKey)) throw new ApiError('INVALID_API_KEY', 'The API key is invalid.', 401);
    const keyHash = this.hash(rawKey);
    const key = await this.prisma.apiKey.findFirst({ where: { keyHash, status: ApiKeyStatus.ACTIVE, tenant: { status: 'ACTIVE' } } });
    if (!key || (key.expiresAt && key.expiresAt <= new Date())) throw new ApiError('INVALID_API_KEY', 'The API key is invalid or expired.', 401);
    // Equal-length constant-time comparison prevents a timing distinction after lookup.
    if (!timingSafeEqual(Buffer.from(key.keyHash, 'hex'), Buffer.from(keyHash, 'hex'))) throw new ApiError('INVALID_API_KEY', 'The API key is invalid.', 401);
    void this.prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    return { keyId: key.id, tenantId: key.tenantId, permissions: key.permissions };
  }

  async create(tenantId: string, input: { name: string; permissions: string[]; expiresAt?: Date; environment?: 'test' | 'live' }): Promise<{ id: string; key: string; prefix: string; permissions: string[]; expires_at: Date | null }> {
    const invalid = input.permissions.filter((permission) => !VALID_PERMISSIONS.has(permission));
    if (invalid.length) throw new ApiError('INVALID_PERMISSION', 'One or more API key permissions are not recognized.', 400, { invalid });
    const environment = input.environment ?? 'test';
    const key = `nk_${environment}_${randomBytes(32).toString('base64url')}`;
    const record = await this.prisma.apiKey.create({ data: { tenantId, name: input.name, permissions: input.permissions, prefix: key.slice(0, 12), keyHash: this.hash(key), expiresAt: input.expiresAt } });
    return { id: record.id, key, prefix: record.prefix, permissions: record.permissions, expires_at: record.expiresAt };
  }

  async list(tenantId: string): Promise<Array<{ id: string; name: string; prefix: string; permissions: string[]; status: ApiKeyStatus; expires_at: Date | null; last_used_at: Date | null; created_at: Date }>> {
    const keys = await this.prisma.apiKey.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    return keys.map((key) => ({ id: key.id, name: key.name, prefix: key.prefix, permissions: key.permissions, status: key.status, expires_at: key.expiresAt, last_used_at: key.lastUsedAt, created_at: key.createdAt }));
  }

  async revoke(tenantId: string, id: string): Promise<void> {
    const result = await this.prisma.apiKey.updateMany({ where: { id, tenantId, status: ApiKeyStatus.ACTIVE }, data: { status: ApiKeyStatus.REVOKED } });
    if (!result.count) throw new ApiError('NOT_FOUND', 'API key not found.', 404);
  }
}
