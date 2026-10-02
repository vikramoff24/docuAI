/**
 * AgentController — HTTP endpoints for AI agent workflows
 *
 * Routes:
 *   POST /api/v1/workflows      → Create a workflow and queue it (MEMBER+)
 *   GET  /api/v1/workflows      → List the organization's workflows
 *   GET  /api/v1/workflows/:id  → Get a single workflow (status + output)
 *
 * organizationId comes from the JWT — never from request body/params.
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationMemberRole } from '@prisma/client';

import { AgentService } from './agent.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('workflows')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('workflows')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  // Workflows can modify document metadata, so viewers may not start them.
  @Roles(OrganizationMemberRole.MEMBER)
  @ApiOperation({ summary: 'Create an agent workflow and queue it for execution' })
  @ApiResponse({ status: 201, description: 'Workflow created (status PENDING)' })
  @ApiResponse({ status: 403, description: 'Requires MEMBER role or higher' })
  async createWorkflow(@CurrentUser() user: RequestUser, @Body() dto: CreateWorkflowDto) {
    return this.agentService.createWorkflow(user.organizationId, user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List the organization's workflows (newest first)" })
  async getWorkflows(@CurrentUser() user: RequestUser) {
    return this.agentService.getWorkflows(user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a workflow by id' })
  @ApiResponse({ status: 404, description: 'Workflow not found in this organization' })
  async getWorkflowById(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agentService.getWorkflowById(id, user.organizationId);
  }
}
