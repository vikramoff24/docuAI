/**
 * AuthController — HTTP endpoints for authentication
 *
 * Routes:
 *   POST /api/v1/auth/register → Create account + organization
 *   POST /api/v1/auth/login    → Get access token + refresh token
 *   POST /api/v1/auth/refresh  → Exchange refresh token for new tokens
 *   POST /api/v1/auth/logout   → Revoke refresh tokens
 *   GET  /api/v1/auth/me       → Get current user profile
 */

import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { RequestUser } from './strategies/jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ──────────────────────────────────────────────────
  // POST /auth/register
  // ──────────────────────────────────────────────────

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user and create an organization' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ──────────────────────────────────────────────────
  // POST /auth/login
  // ──────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful, returns tokens' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: FastifyRequest,
  ) {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;
    const userAgent = req.headers['user-agent'];

    return this.authService.login(dto, ipAddress, userAgent);
  }

  // ──────────────────────────────────────────────────
  // POST /auth/refresh
  // ──────────────────────────────────────────────────

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  async refresh(
    @Body() body: { refreshToken: string },
    @Req() req: FastifyRequest,
  ) {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;
    const userAgent = req.headers['user-agent'];

    return this.authService.refreshTokens(body.refreshToken, ipAddress, userAgent);
  }

  // ──────────────────────────────────────────────────
  // POST /auth/logout
  // ──────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout and revoke refresh tokens' })
  async logout(
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    // Extract the raw token so it can be blacklisted in Redis
    const authHeader = req.headers.authorization ?? '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    await this.authService.logout(user.userId, accessToken);
  }

  // ──────────────────────────────────────────────────
  // GET /auth/me
  // ──────────────────────────────────────────────────

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current authenticated user' })
  getMe(@CurrentUser() user: RequestUser) {
    return user;
  }
}
