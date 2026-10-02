import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Health check endpoint.
   * Used by:
   * - Docker Compose healthcheck
   * - Kubernetes liveness probe
   * - Load balancer health check
   * - CI smoke tests after deployment
   *
   * Returns 200 if the API is running.
   * Returns 503 if database is unreachable.
   */
  @SkipThrottle({ short: true, sustained: true }) // load balancer / uptime probes
  @Get('health')
  @ApiOperation({ summary: 'API health check' })
  getHealth() {
    return this.appService.getHealth();
  }
}
