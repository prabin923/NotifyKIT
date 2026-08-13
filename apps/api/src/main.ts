import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { PrismaService } from './common/prisma.service';
import { ResponseEnvelopeInterceptor } from './common/response-envelope.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const origins = (process.env.CORS_ORIGINS ?? process.env.DASHBOARD_URL ?? 'http://localhost:3001').split(',').map((value) => value.trim());
  app.use(helmet({ contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false }));
  app.enableCors({ origin: origins, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false } }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  const config = new DocumentBuilder().setTitle('Universal Notification Platform API').setDescription('Multi-tenant Notification-as-a-Service REST API').setVersion('1.0').addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'API key or dashboard JWT' }).build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  const prisma = app.get(PrismaService);
  prisma.enableShutdownHooks(app);
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.info(JSON.stringify({ message: 'API started', port }));
}

void bootstrap();
