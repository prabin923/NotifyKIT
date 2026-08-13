import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import type { DashboardUserContext } from '../common/request-context';
import type { StringValue } from 'ms';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<{ access_token: string; user: Omit<DashboardUserContext, 'id'> & { id: string; name: string } }> {
    const user = await this.prisma.dashboardUser.findFirst({ where: { email: email.toLowerCase(), status: 'ACTIVE', tenant: { status: 'ACTIVE' } } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new ApiError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401);
    }
    await this.prisma.dashboardUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, tenant_id: user.tenantId, role: user.role, email: user.email },
      { expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ?? '15m') as StringValue },
    );
    return { access_token: accessToken, user: { id: user.id, tenantId: user.tenantId, role: user.role, email: user.email, name: user.name } };
  }

  async verifyToken(token: string): Promise<DashboardUserContext> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; tenant_id: string; role: DashboardUserContext['role']; email: string }>(token);
      const user = await this.prisma.dashboardUser.findFirst({ where: { id: payload.sub, tenantId: payload.tenant_id, status: 'ACTIVE', tenant: { status: 'ACTIVE' } } });
      if (!user) throw new Error('user unavailable');
      return { id: user.id, tenantId: user.tenantId, role: user.role, email: user.email };
    } catch {
      throw new ApiError('INVALID_TOKEN', 'The access token is invalid or expired.', 401);
    }
  }
}
