/**
 * InvitationsController — HTTP endpoints for invitation management
 *
 * Routes (all behind JWT auth):
 *   POST   /api/v1/organizations/current/invitations         → Create invitation (ADMIN/OWNER only)
 *   GET    /api/v1/organizations/current/invitations         → List org invitations (ADMIN/OWNER only)
 *   DELETE /api/v1/organizations/current/invitations/:id    → Cancel invitation
 *
 * Public routes (no JWT required):
 *   POST   /api/v1/invitations/accept → Accept an invitation by token
 *
 * Note: Invitation endpoints are nested under /organizations/current
 * because they are organization-scoped resources.
 * The organizationId always comes from the JWT, not the URL.
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { RateLimit } from '../common/rate-limit/rate-limit';

@ApiTags('invitations')
@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  // ──────────────────────────────────────────────────
  // POST /organizations/current/invitations
  // ──────────────────────────────────────────────────

  @Post('organizations/current/invitations')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Send an invitation to join the organization (ADMIN/OWNER only)' })
  @ApiResponse({ status: 201, description: 'Invitation created' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 409, description: 'User already a member or invite already pending' })
  async createInvitation(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.createInvitation(
      user.organizationId,
      user.userId,
      user.role,
      dto,
    );
  }

  // ──────────────────────────────────────────────────
  // GET /organizations/current/invitations
  // ──────────────────────────────────────────────────

  @Get('organizations/current/invitations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all invitations for the current organization' })
  @ApiResponse({ status: 200, description: 'Invitations list' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  async listInvitations(@CurrentUser() user: RequestUser) {
    return this.invitationsService.listInvitations(user.organizationId, user.role);
  }

  // ──────────────────────────────────────────────────
  // DELETE /organizations/current/invitations/:id
  // ──────────────────────────────────────────────────

  @Delete('organizations/current/invitations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cancel a pending invitation' })
  @ApiResponse({ status: 204, description: 'Invitation cancelled' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  async cancelInvitation(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) invitationId: string,
  ) {
    await this.invitationsService.cancelInvitation(
      invitationId,
      user.organizationId,
      user.role,
    );
  }

  // ──────────────────────────────────────────────────
  // POST /invitations/accept
  // Public endpoint — no JWT required (user may not have a token yet)
  // ──────────────────────────────────────────────────

  @RateLimit('invitationPreview')
  @Get('invitations/preview')
  @ApiOperation({ summary: 'Public: who invited whom to which organization (for the invite landing page)' })
  @ApiResponse({ status: 404, description: 'Unknown token' })
  async previewInvitation(@Query('token', ParseUUIDPipe) token: string) {
    return this.invitationsService.previewInvitation(token);
  }

  @RateLimit('invitationAccept')
  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)  // Accepting requires the user to be logged in
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Accept an invitation to join an organization' })
  @ApiResponse({ status: 200, description: 'Invitation accepted, membership created' })
  @ApiResponse({ status: 403, description: 'Invitation not intended for your email' })
  @ApiResponse({ status: 404, description: 'Invitation not found or expired' })
  @ApiResponse({ status: 409, description: 'Invitation already accepted/cancelled' })
  async acceptInvitation(
    @CurrentUser() user: RequestUser,
    @Body() body: AcceptInvitationDto,
  ) {
    return this.invitationsService.acceptInvitation(body.token, user.email);
  }
}
