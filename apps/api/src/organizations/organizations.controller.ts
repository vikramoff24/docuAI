import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { OrganizationsService } from './organizations.service';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

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

  @Patch('current/members/:userId')
  @ApiOperation({ summary: "Change a member's role (ADMIN+, only for people ranked below you)" })
  updateMemberRole(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.orgsService.updateMemberRole(user.organizationId, targetUserId, dto.role, user);
  }

  @Delete('current/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member, or leave the organization when userId is yourself' })
  async removeMember(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    await this.orgsService.removeMember(user.organizationId, targetUserId, user);
  }
}
