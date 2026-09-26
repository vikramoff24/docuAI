/**
 * LocalStrategy — validates email/password for login
 *
 * This strategy is used ONLY for the login endpoint.
 * It's called by LocalAuthGuard, which is applied only to POST /auth/login.
 *
 * After login succeeds, the client receives a JWT access token.
 * All subsequent requests use JwtStrategy instead.
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';

import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private readonly authService: AuthService) {
    super({
      usernameField: 'email', // Tell passport to use 'email' instead of 'username'
      passwordField: 'password',
    });
  }

  async validate(email: string, password: string) {
    try {
      return await this.authService.validateUser(email, password);
    } catch {
      throw new UnauthorizedException('Invalid email or password');
    }
  }
}
