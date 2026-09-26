import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  @Get('current')
  getCurrentOrg(@CurrentUser() user: RequestUser) {
    return this.orgsService.findById(user.organizationId, user.userId);
  }

  @Get('current/members')
  getMembers(@CurrentUser() user: RequestUser) {
    return this.orgsService.getMembers(user.organizationId);
  }
}
