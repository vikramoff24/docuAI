/**
 * AiSettingsController — organization AI provider keys (Settings UI).
 *
 * Routes:
 *   GET    /api/v1/settings/ai             → key status for the org (any member)
 *   PUT    /api/v1/settings/ai/openai-key  → verify + store an OpenAI key (ADMIN+)
 *   DELETE /api/v1/settings/ai/openai-key  → remove the org key (ADMIN+)
 *
 * The key itself is never returned — only `last4`.
 */

import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrganizationMemberRole } from '@prisma/client';

import { AiCredentialsService } from './ai-credentials.service';
import { SetOpenAIKeyDto } from './dto/set-openai-key.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { RateLimit } from '../common/rate-limit/rate-limit';

@ApiTags('settings')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings/ai')
export class AiSettingsController {
  constructor(private readonly credentials: AiCredentialsService) {}

  @Get()
  @ApiOperation({ summary: 'AI key status for the current organization' })
  getStatus(@CurrentUser() user: RequestUser) {
    return this.credentials.getStatus(user.organizationId);
  }

  @RateLimit('aiKeyVerify')
  @Put('openai-key')
  @Roles(OrganizationMemberRole.ADMIN)
  @ApiOperation({ summary: 'Verify and store the organization OpenAI API key' })
  @ApiResponse({ status: 422, description: 'Malformed key, or OpenAI rejected it' })
  @ApiResponse({ status: 502, description: 'OpenAI unreachable during verification' })
  setOpenAIKey(@CurrentUser() user: RequestUser, @Body() dto: SetOpenAIKeyDto) {
    return this.credentials.setOpenAIKey(user.organizationId, user.userId, dto.apiKey);
  }

  @Delete('openai-key')
  @Roles(OrganizationMemberRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove the organization OpenAI API key' })
  async removeOpenAIKey(@CurrentUser() user: RequestUser) {
    await this.credentials.removeOpenAIKey(user.organizationId, user.userId);
  }
}
