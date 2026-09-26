import { Injectable } from '@nestjs/common';

import { DatabaseService } from './database/database.service';

@Injectable()
export class AppService {
  constructor(private readonly db: DatabaseService) {}

  async getHealth() {
    // Check database connectivity
    let dbStatus = 'ok';
    try {
      await this.db.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'unreachable';
    }

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] ?? '0.1.0',
      services: {
        database: dbStatus,
      },
    };
  }
}
