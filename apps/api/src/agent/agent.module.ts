import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AgentController } from './agent.controller';
import { AgentService, AGENT_WORKFLOWS_QUEUE } from './agent.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: AGENT_WORKFLOWS_QUEUE,
    }),
  ],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
