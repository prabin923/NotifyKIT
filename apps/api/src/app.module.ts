import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';
import { AnalyticsModule } from './analytics/analytics.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './common/prisma.module';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PreferencesModule } from './preferences/preferences.module';
import { QueueModule } from './queue/queue.module';
import { TemplatesModule } from './templates/templates.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: Joi.object({ NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'), DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(), REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(), JWT_SECRET: Joi.string().min(32).required(), JWT_EXPIRES_IN: Joi.string().default('15m'), API_KEY_PEPPER: Joi.string().min(24).required(), WEBHOOK_ENCRYPTION_KEY: Joi.string().required(), API_PORT: Joi.number().port().default(3000), DASHBOARD_URL: Joi.string().uri().default('http://localhost:3001'), CORS_ORIGINS: Joi.string().default('http://localhost:3001'), EMAIL_PROVIDER: Joi.string().valid('console', 'smtp').default('console'), PUSH_PROVIDER: Joi.string().valid('console', 'fcm').default('console') }).unknown(true) }),
    PrismaModule, CommonModule, QueueModule, AuthModule, ApiKeysModule, TemplatesModule, PreferencesModule, EventsModule, NotificationsModule, WebhooksModule, WorkflowsModule, UsersModule, AnalyticsModule, HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void { consumer.apply(RequestContextMiddleware).forRoutes('*'); }
}
