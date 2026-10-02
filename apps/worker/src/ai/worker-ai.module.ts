import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OpenAIProvider } from '@docuflow/ai';

import {
  AI_PROVIDER,
  AI_PROVIDER_FACTORY,
  WorkerAiCredentialsService,
  type AiProviderFactory,
} from './worker-ai-credentials.service';

/** AI providers + per-organization key resolution for all worker consumers. */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new OpenAIProvider(config.get<string>('OPENAI_API_KEY')),
    },
    {
      provide: AI_PROVIDER_FACTORY,
      useValue: ((apiKey: string) => new OpenAIProvider(apiKey)) satisfies AiProviderFactory,
    },
    WorkerAiCredentialsService,
  ],
  exports: [WorkerAiCredentialsService],
})
export class WorkerAiModule {}
