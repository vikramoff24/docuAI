import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { StorageService } from './storage.service';
import { DOCUMENT_PROCESSING_QUEUE } from './documents.constants';
@Module({
  imports: [
    // Register queue so DocumentsService can inject it and add jobs
    BullModule.registerQueue({
      name: DOCUMENT_PROCESSING_QUEUE,
    }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, StorageService],
  exports: [DocumentsService, StorageService],
})
export class DocumentsModule {}
