/**
 * AIModule — Provides AI provider as a NestJS injectable service.
 *
 * This module instantiates the appropriate AI provider based on the
 * AI_PROVIDER environment variable and makes it available for injection
 * throughout the API.
 *
 * DESIGN: We wrap the @docuflow/ai plain classes in NestJS providers.
 * The AI_PROVIDER token is used for injection (string token, not class token)
 * to decouple from specific provider implementations.
 *
 * USAGE:
 *   @Inject(AI_PROVIDER_TOKEN) private ai: AIProvider
 *   await this.ai.complete(messages, options);
 *
 * PROVIDER SELECTION:
 *   AI_PROVIDER=openai (default) → OpenAIProvider
 *   Future: AI_PROVIDER=anthropic → AnthropicProvider
 *
 * GRACEFUL DEGRADATION:
 *   If OPENAI_API_KEY is not set, AI features return 503 Service Unavailable
 *   with a clear error message. The app still starts and other features work.
 */

import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIProvider } from '@docuflow/ai';
import type { AIProvider } from '@docuflow/ai';
import { RAGService } from './rag.service';
import { AIController } from './ai.controller';
import { AI_PROVIDER_FACTORY_TOKEN, AI_PROVIDER_TOKEN, OPENAI_KEY_VERIFIER_TOKEN } from './ai.constants';
import { AiCredentialsService, verifyOpenAIKeyOnline, type AiProviderFactory } from './ai-credentials.service';
import { AiSettingsController } from './ai-settings.controller';

@Global() // AI provider is available everywhere without re-importing this module
@Module({
  providers: [
    {
      provide: AI_PROVIDER_TOKEN,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): AIProvider => {
        const providerName = configService.get<string>('AI_PROVIDER', 'openai');
        const openaiApiKey = configService.get<string>('OPENAI_API_KEY');

        switch (providerName.toLowerCase()) {
          case 'openai':
          default:
            return new OpenAIProvider(openaiApiKey);
        }
      },
    },
    {
      provide: AI_PROVIDER_FACTORY_TOKEN,
      useValue: ((apiKey: string) => new OpenAIProvider(apiKey)) satisfies AiProviderFactory,
    },
    { provide: OPENAI_KEY_VERIFIER_TOKEN, useValue: verifyOpenAIKeyOnline },
    AiCredentialsService,
    RAGService,
  ],
  controllers: [AIController, AiSettingsController],
  exports: [AI_PROVIDER_TOKEN, AiCredentialsService, RAGService],
})
export class AIModule {}
