import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

import { AgentWorkflowsConsumer, AGENT_WORKFLOWS_QUEUE } from './agent-workflows.consumer';

@Module({
  imports: [BullModule.registerQueue({ name: AGENT_WORKFLOWS_QUEUE })],
  providers: [AgentWorkflowsConsumer],
})
export class AgentWorkflowsModule {}
