/**
 * AgentService — creates and queries agent workflows.
 *
 * Execution happens in the worker (`agent_workflows` queue); the API only
 * persists the workflow row and enqueues a job for it.
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Prisma } from '@prisma/client';

import { DatabaseService } from '../database/database.service';
import { CreateWorkflowDto, MAX_INPUT_BYTES } from './dto/create-workflow.dto';

export const AGENT_WORKFLOWS_QUEUE = 'agent_workflows';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly db: DatabaseService,
    @InjectQueue(AGENT_WORKFLOWS_QUEUE) private readonly workflowQueue: Queue,
  ) {}

  async createWorkflow(organizationId: string, userId: string, dto: CreateWorkflowDto) {
    const input = { ...(dto.input ?? {}), instructions: dto.instructions };
    if (Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_INPUT_BYTES) {
      throw new BadRequestException(`Workflow input must be at most ${MAX_INPUT_BYTES} bytes`);
    }

    const workflow = await this.db.workflow.create({
      data: {
        organizationId,
        createdById: userId,
        type: dto.type,
        input: input as Prisma.InputJsonValue,
        status: 'PENDING',
      },
    });

    await this.db.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'AI_AGENT_ACTION',
        resourceType: 'workflow',
        resourceId: workflow.id,
        metadata: { event: 'workflow_created', type: dto.type },
      },
    });

    // LLM failures are not retried automatically — the consumer marks the
    // workflow FAILED instead, so a single attempt is enough.
    try {
      await this.workflowQueue.add(
        'execute-workflow',
        { workflowId: workflow.id, organizationId },
        { attempts: 1, removeOnComplete: true },
      );
    } catch (err) {
      // Without a job nothing would ever pick this up: don't leave it PENDING forever
      this.logger.error(`Failed to queue workflow ${workflow.id}: ${err}`);
      await this.db.workflow.update({
        where: { id: workflow.id },
        data: { status: 'FAILED', error: 'Could not queue the workflow. Please try again.' },
      });
      throw new ServiceUnavailableException('Could not queue the workflow. Please try again.');
    }

    return workflow;
  }

  async getWorkflows(organizationId: string) {
    return this.db.workflow.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getWorkflowById(id: string, organizationId: string) {
    const workflow = await this.db.workflow.findFirst({
      where: { id, organizationId },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    return workflow;
  }
}
