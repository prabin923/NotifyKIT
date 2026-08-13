import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DashboardJwtGuard } from './dashboard-jwt.guard';

@Global()
@Module({
  imports: [JwtModule.registerAsync({ imports: [ConfigModule], inject: [ConfigService], useFactory: (config: ConfigService) => ({ secret: config.get<string>('JWT_SECRET') }) })],
  controllers: [AuthController],
  providers: [AuthService, DashboardJwtGuard],
  exports: [AuthService, DashboardJwtGuard],
})
export class AuthModule {}
