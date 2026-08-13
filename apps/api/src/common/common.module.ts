import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { SecretCipherService } from './secret-cipher.service';
import { RateLimiterService } from './rate-limiter.service';

@Global()
@Module({ providers: [AuditService, SecretCipherService, RateLimiterService], exports: [AuditService, SecretCipherService, RateLimiterService] })
export class CommonModule {}
