import { Module } from '@nestjs/common';
import { PreferencesModule } from '../preferences/preferences.module';
import { QueueModule } from '../queue/queue.module';
import { TemplatesModule } from '../templates/templates.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
@Module({ imports: [TemplatesModule, PreferencesModule, QueueModule], controllers: [EventsController], providers: [EventsService], exports: [EventsService] })
export class EventsModule {}
