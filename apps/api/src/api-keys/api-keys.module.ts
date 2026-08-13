import { Global, Module } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysService } from './api-keys.service';

@Global()
@Module({ controllers: [ApiKeysController], providers: [ApiKeysService, ApiKeyGuard], exports: [ApiKeysService, ApiKeyGuard] })
export class ApiKeysModule {}
