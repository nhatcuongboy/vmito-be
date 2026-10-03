import { Module } from '@nestjs/common';
import { UserRecommendationContextService } from './user-recommendation-context.service';

/**
 * Rule-based "Gợi ý cho bạn" ranking shared by the discovery lists
 * (`sortBy=recommended`). Scorers are pure functions in `scorers/`; this
 * module only provides the per-request viewer context.
 */
@Module({
  providers: [UserRecommendationContextService],
  exports: [UserRecommendationContextService],
})
export class RecommendationsModule {}
