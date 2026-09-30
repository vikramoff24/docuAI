import { Global, Module } from '@nestjs/common';
import { WorkerDatabaseService } from './worker-database.service';

@Global()
@Module({
  providers: [WorkerDatabaseService],
  exports: [WorkerDatabaseService],
})
export class WorkerDatabaseModule {}
