import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsModule } from '../events/events.module';
import { TemplatesModule } from '../templates/templates.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { AnalyticsController } from './analytics.controller';
import { DashboardDataController } from './dashboard-data.controller';
import { AnalyticsService } from './analytics.service';
@Module({ imports: [NotificationsModule, TemplatesModule, WebhooksModule, WorkflowsModule, EventsModule], controllers: [AnalyticsController, DashboardDataController], providers: [AnalyticsService] }) export class AnalyticsModule {}
