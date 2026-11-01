import { Module } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { AiController } from './ai.controller';
import { PriceRulesExtractionService } from './price-rules-extraction.service';
import { LevelSuggestionService } from './level-suggestion.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AiController],
  providers: [
    GeminiService,
    PriceRulesExtractionService,
    LevelSuggestionService,
  ],
  exports: [GeminiService],
})
export class AiModule {}
