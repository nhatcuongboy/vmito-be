import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  GenerativeModel,
  Content,
} from '@google/generative-ai';
import {
  ExtractedSessionDto,
  ChatMessageDto,
} from './dto/extract-session.dto';
import { Language, DEFAULT_LANGUAGE } from '../common/constants/language.enum';

const VMITO_SYSTEM_PROMPT = `Bạn là AI Assistant của Vmito - ứng dụng quản lý và tổ chức các buổi tập thể thao (cầu lông, pickleball, tennis, bóng đá, v.v.).

## Về Vmito
Vmito giúp người dùng:
- **Tạo kèo (session)**: Tổ chức buổi tập, mời bạn tham gia, đặt sân
- **Tham gia kèo**: Tìm và đăng ký tham gia các buổi tập do người khác tổ chức
- **Quản lý Club**: Tạo và quản lý nhóm/câu lạc bộ thể thao
- **Thanh toán phí**: Theo dõi và thu phí tham gia từ các thành viên
- **Quản lý người chơi**: Phân chia sân, nhóm, đội trong buổi tập
- **Xem lịch sử**: Theo dõi các buổi tập đã qua và sắp tới

## Vai trò người dùng
- **Host**: Người tổ chức buổi tập, có thể tạo session, mời người chơi, thu phí
- **Player**: Người tham gia buổi tập
- **Admin**: Quản trị viên hệ thống

## Hướng dẫn trả lời
- Trả lời bằng tiếng Việt trừ khi người dùng hỏi bằng tiếng Anh
- Ngắn gọn, rõ ràng và thực tế
- Nếu có context về trang hiện tại, ưu tiên giải đáp liên quan đến trang đó
- Khi không biết thông tin cụ thể của user (số liệu, dữ liệu thực), hãy hướng dẫn họ cách thực hiện trong app
- Sử dụng emoji phù hợp để câu trả lời dễ đọc hơn

Hãy giúp đỡ người dùng sử dụng Vmito một cách hiệu quả nhất!`;

@Injectable()
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      console.warn(
        'GEMINI_API_KEY not found in environment variables. AI features will be disabled.'
      );
      return;
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  private getLanguageInstruction(language: Language): string {
    const languageNames = {
      [Language.VI]: 'Vietnamese (Tiếng Việt)',
      [Language.EN]: 'English',
      [Language.CN]: 'Chinese (中文)',
    };

    return `IMPORTANT: You MUST respond in ${languageNames[language]}. All field values in the JSON response should be in ${languageNames[language]}.`;
  }

  async generateText(prompt: string, language?: Language): Promise<string> {
    if (!this.model) {
      throw new Error('Gemini API key is missing.');
    }

    let finalPrompt = prompt;
    if (language) {
      const languageInstruction = this.getLanguageInstruction(language);
      finalPrompt = `${languageInstruction}\n\n${prompt}`;
    }

    try {
      const result = await this.model.generateContent(finalPrompt);
      const response = result.response;
      return response.text();
    } catch (error) {
      console.error('Error generating content with Gemini:', error);
      throw error;
    }
  }

  async extractSessionFromArticle(
    articleContent: string,
    language: Language = DEFAULT_LANGUAGE
  ): Promise<ExtractedSessionDto> {
    if (!this.model) {
      throw new Error('Gemini API key is missing.');
    }

    const currentYear = new Date().getFullYear();
    const languageInstruction = this.getLanguageInstruction(language);

    const prompt = `You are an AI assistant that extracts badminton session information from recruitment posts.

${languageInstruction}

Analyze the following article/post and extract session details. The post is typically a recruitment for casual badminton players (tuyển vãng lai).

Article content:
"""
${articleContent}
"""

Extract and return a JSON object with the following fields (use null for fields that cannot be determined):

{
  "name": "Session name - create a short descriptive name based on venue and time if not explicitly stated",
  "description": "Additional details or notes from the post",
  "hostName": "Name of the host/organizer",
  "hostPhone": "Phone number of the host (format: 0xxxxxxxxx)",
  "startTime": "ISO 8601 datetime string (use year ${currentYear} if year not specified)",
  "endTime": "ISO 8601 datetime string (use year ${currentYear} if year not specified)",
  "maxPlayersPerCourt": "Number of max players per court (default 8 if not specified)",
  "requiredLevels": "Array of level numbers 1-8 where: 1=Beginner, 2=Advanced Beginner, 3=Low Intermediate, 4=Intermediate, 5=High Intermediate, 6=Advanced, 7=Semi Pro, 8=Pro. Map Vietnamese terms like TB (Trung Bình)=4, K (Khá)=5, Y (Yếu)=2-3, Mạnh=6-7. Return array like [3,4,5] for a range. Return null if all levels welcome.",
  "numberOfCourts": "Number of courts if mentioned",
  "courtNames": "Array of specific court names or numbers mentioned (e.g., ['Sân 5', 'Sân 6']). Return null if not specified.",
  "shuttlecock": "Type of shuttlecock used (e.g., 'Thành Công', 'Victor'). Return null if not specified.",
  "feeConfig": {
    "feeType": "Use 'FIXED' if prices are set per gender, or 'SPLIT_EVENLY' if costs are shared after play. Default to 'FIXED' if specific prices are mentioned.",
    "maleFee": "Price for male players in VND. Extract from terms like 'Nam 50k' -> 50000",
    "femaleFee": "Price for female players in VND. Extract from terms like 'Nữ 40k' -> 40000",
    "notes": "Additional notes about fees (e.g., 'Bao sân', 'Chưa cộng tiền cầu')"
  },
  "venue": {
    "name": "Venue/court name",
    "address": "Full address if available",
    "district": "District (Quận/Huyện)",
    "city": "City (default 'Hồ Chí Minh' if in Vietnam and not specified)"
  }
}

IMPORTANT:
- Return ONLY valid JSON, no markdown formatting
- For time, if only time is given (e.g., "18h-20h"), combine with the date mentioned or today's date
- For Vietnamese level terms: Y/Yếu=2-3, TB/Trung Bình=4, K/Khá=5, Mạnh/Giỏi=6-7
- Phone numbers should be in format 0xxxxxxxxx
- Extract fees carefully: 'k' means thousand (50k = 50000)
- If a field cannot be determined, use null`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Clean the response - remove markdown code blocks if present
      const cleanedText = text
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      // Parse the JSON
      const extracted = JSON.parse(cleanedText) as ExtractedSessionDto;
      return extracted;
    } catch (error) {
      console.error('Error extracting session from article:', error);
      throw new Error('Failed to extract session information from article');
    }
  }

  async chatWithAssistant(
    messages: ChatMessageDto[],
    pageContext?: string
  ): Promise<ReadableStream<Uint8Array>> {
    if (!this.model) {
      throw new Error('Gemini API key is missing.');
    }

    // Build system prompt with optional page context
    let systemPrompt = VMITO_SYSTEM_PROMPT;
    if (pageContext) {
      systemPrompt += `\n\n## Context hiện tại\nNgười dùng đang ở trang: ${pageContext}`;
    }

    // Convert messages to Gemini Content format (history = all but last)
    const history: Content[] = messages.slice(0, -1).map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1];

    const chat = this.model.startChat({
      history,
      systemInstruction: systemPrompt,
    });

    const result = await chat.sendMessageStream(lastMessage.content);

    // Return a Web Streams API ReadableStream
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
        } catch (err) {
          console.error('Gemini stream error:', err);
        } finally {
          controller.close();
        }
      },
    });
  }
}
