import {
  Controller,
  Post,
  Body,
  UseGuards,
  Res,
  HttpException,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { GeminiService } from './gemini.service';
import {
  ExtractSessionRequestDto,
  AiChatRequestDto,
} from './dto/extract-session.dto';
import {
  ExtractScheduleRequestDto,
  ExtractScheduleResponseDto,
} from './dto/extract-schedule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedRequest {
  user: {
    userId: string;
    name?: string;
    role: string;
  };
}

@ApiTags('ai')
@ApiBearerAuth('JWT-auth')
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Post('extract-session')
  async extractSession(
    @Body() dto: ExtractSessionRequestDto,
    @Request() req: AuthenticatedRequest
  ) {
    const extracted = await this.geminiService.extractSessionFromArticle(
      dto.articleContent,
      dto.language
    );

    // Default hostName to current user's name if AI doesn't extract it
    if (!extracted.hostName && req.user?.name) {
      extracted.hostName = req.user.name;
    }

    return extracted;
  }

  @Post('extract-schedule')
  async extractSchedule(
    @Body() dto: ExtractScheduleRequestDto
  ): Promise<ExtractScheduleResponseDto> {
    if (!dto.text || !dto.text.trim()) {
      throw new HttpException(
        'text is required',
        HttpStatus.BAD_REQUEST
      );
    }
    const entries = await this.geminiService.extractScheduleFromText(
      dto.tournamentId,
      dto.text,
      dto.language
    );
    return { entries };
  }

  /**
   * POST /ai/chat
   * Streams a Gemini response for the AI Assistant chat panel.
   * Uses Server-Sent Events (SSE) / plain text streaming.
   */
  @Post('chat')
  async chat(@Body() dto: AiChatRequestDto, @Res() res: Response) {
    if (!dto.messages || dto.messages.length === 0) {
      throw new HttpException('No messages provided', HttpStatus.BAD_REQUEST);
    }

    try {
      const stream = await this.geminiService.chatWithAssistant(
        dto.messages,
        dto.pageContext,
        dto.language
      );

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const reader = stream.getReader();
      const decoder = new TextDecoder();

      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
        res.end();
      };

      await pump();
    } catch (error) {
      console.error('AI chat error:', error);
      if (!res.headersSent) {
        throw new HttpException(
          'Failed to process AI request',
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
      res.end();
    }
  }
}
