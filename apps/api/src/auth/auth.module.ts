/**
 * AuthModule
 *
 * ────────────────────────────────────────────────────────
 * WHAT AUTHENTICATION IS vs. WHAT AUTHORIZATION IS
 * ────────────────────────────────────────────────────────
 *
 * Authentication: WHO are you? (identity verification)
 *   → Login with email/password
 *   → Get a JWT access token
 *   → "I am alice@acme.com"
 *
 * Authorization: WHAT are you allowed to do? (permission check)
 *   → Does alice have ADMIN role in organization X?
 *   → Is alice allowed to delete this document?
 *   → Authorization happens AFTER authentication
 *
 * This module handles authentication only.
 * Authorization (RBAC) is in the guards and OrganizationsModule.
 *
 * ────────────────────────────────────────────────────────
 * NESTJS PASSPORT STRATEGY
 * ────────────────────────────────────────────────────────
 * Passport.js is a Node.js authentication middleware library.
 * It uses "strategies" — pluggable authentication mechanisms.
 * @nestjs/passport wraps Passport with NestJS DI.
 *
 * We use:
 * - LocalStrategy (passport-local): validates email/password
 * - JwtStrategy (passport-jwt): validates JWT access tokens
 * - RefreshTokenStrategy: validates JWT refresh tokens
 *
 * When you decorate a route with @UseGuards(JwtAuthGuard),
 * NestJS calls the JwtStrategy.validate() method automatically.
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // JwtModule configuration
    // The secret and options are loaded from ConfigService
    // Using registerAsync allows us to inject ConfigService
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret', 'dev-secret-change-in-production'),
        signOptions: {
          expiresIn: config.get<string>('jwt.accessExpiresIn', '15m'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
