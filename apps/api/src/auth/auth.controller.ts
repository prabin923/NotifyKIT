import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto';
import { DashboardJwtGuard } from './dashboard-jwt.guard';
import type { PlatformRequest } from '../common/request-context';

@ApiTags('Authentication')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Authenticate a dashboard user' })
  login(@Body() body: LoginDto): Promise<{ access_token: string; user: { id: string; tenantId: string; role: string; email: string; name: string } }> {
    return this.auth.login(body.email, body.password);
  }

  @Get('me')
  @UseGuards(DashboardJwtGuard)
  @ApiBearerAuth()
  me(@Req() request: PlatformRequest): { id: string; tenantId: string; role: string; email: string } | undefined {
    return request.dashboardUser;
  }
}
