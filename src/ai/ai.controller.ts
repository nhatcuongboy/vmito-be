import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GeminiService } from './gemini.service';
import { ExtractSessionRequestDto } from './dto/extract-session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('ai')
@ApiBearerAuth('JWT-auth')
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Post('extract-session')
  async extractSession(@Body() dto: ExtractSessionRequestDto) {
    const extracted = await this.geminiService.extractSessionFromArticle(
      dto.articleContent,
      dto.language
    );
    return {
      success: true,
      data: extracted,
    };
  }
}
