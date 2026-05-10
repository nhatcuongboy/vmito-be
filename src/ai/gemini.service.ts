import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { ExtractedSessionDto, ChatMessageDto } from './dto/extract-session.dto';
import { Language, DEFAULT_LANGUAGE } from '../common/constants/language.enum';
import { PrismaService } from '../prisma/prisma.service';

const MODEL = 'gemini-3-flash-preview';

/**
 * Maps AI-returned short name strings to numeric level IDs (1-8).
 * Aligned with FE levelShorts: 1=Yếu, 2=TBY, 3=TB-, 4=TB, 5=TB+, 6=Khá, 7=BC, 8=CN
 */
const LEVEL_SHORT_NAME_MAP: Record<string, number> = {
  Y: 1,
  TBY: 2,
  'TB-': 3,
  TB: 4,
  'TB+': 5,
  K: 6,
  'K-': 6,
  Khá: 6,
  BC: 7,
  CN: 8,
  Pro: 8,
};

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

## Trình độ người chơi (luôn dùng tên ngắn, KHÔNG dùng số)
Khi nhắc đến trình độ, LUÔN dùng tên ngắn theo bảng sau:
- **Y** = Yếu (Beginner)
- **TBY** = Trung bình yếu (Advanced Beginner)
- **TB-** = Trung bình- (Low Intermediate)
- **TB** = Trung bình (Intermediate)
- **TB+** = Trung bình+ (High Intermediate)
- **Khá** = Khá (Advanced)
- **BC** = Bán chuyên (Semi Pro)
- **CN** = Chuyên nghiệp (Pro)

Ví dụ: thay vì "Level 3" hãy nói "TB-"; thay vì "Level 6" hãy nói "Khá".

## Hướng dẫn trả lời
- Trả lời bằng tiếng Việt trừ khi người dùng hỏi bằng tiếng Anh
- Ngắn gọn, rõ ràng và thực tế
- Nếu có context về trang hiện tại, ưu tiên giải đáp liên quan đến trang đó
- Khi không biết thông tin cụ thể của user (số liệu, dữ liệu thực), hãy hướng dẫn họ cách thực hiện trong app
- Sử dụng emoji phù hợp để câu trả lời dễ đọc hơn

Hãy giúp đỡ người dùng sử dụng Vmito một cách hiệu quả nhất!`;

@Injectable()
export class GeminiService {
  private ai: GoogleGenAI | null = null;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      console.warn(
        'GEMINI_API_KEY not found in environment variables. AI features will be disabled.'
      );
      return;
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  private getLanguageInstruction(language: Language): string {
    const languageNames = {
      [Language.VI]: 'Vietnamese (Tiếng Việt)',
      [Language.EN]: 'English',
      [Language.CN]: 'Chinese (中文)',
    };
    return `IMPORTANT: You MUST respond in ${languageNames[language]}. All field values in the JSON response should be in ${languageNames[language]}.`;
  }

  /**
   * Find best matching venue in database based on AI extracted venue data
   */
  private async findMatchingVenue(extractedVenue: {
    name?: string;
    address?: string;
    district?: string;
    city?: string;
  }): Promise<string | null> {
    if (!extractedVenue.name && !extractedVenue.address) {
      return null;
    }

    // Fetch all active venues
    const venues = await this.prisma.venue.findMany({
      where: {
        status: 'ACTIVE',
        closureStatus: 'OPERATING',
      },
      select: {
        id: true,
        name: true,
        address: true,
        district: true,
        city: true,
      },
    });

    if (venues.length === 0) {
      return null;
    }

    type VenueMatch = {
      id: string;
      name: string;
      address: string;
      district: string | null;
      city: string | null;
    };

    // Helper function to normalize text for better matching
    const normalizeText = (text: string): string => {
      return text
        .toLowerCase()
        .replace(/sân\s+cầu\s+lông\s+/gi, '') // Remove "sân cầu lông" prefix
        .replace(/sân\s+/gi, '') // Remove "sân" prefix
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
    };

    // Helper function to calculate match score
    const calculateMatchScore = (venue: VenueMatch): number => {
      let score = 0;
      const normalizedVenueName = normalizeText(venue.name);
      const normalizedVenueAddress = venue.address.toLowerCase();
      const normalizedSearchName = normalizeText(extractedVenue.name || '');
      const normalizedSearchAddress = (
        extractedVenue.address || ''
      ).toLowerCase();

      // Exact match gets highest score
      if (normalizedVenueName === normalizedSearchName) {
        score += 100;
      }
      // Contains match
      else if (normalizedVenueName.includes(normalizedSearchName)) {
        score += 50;
      } else if (normalizedSearchName.includes(normalizedVenueName)) {
        score += 50;
      }
      // Word-by-word matching
      else {
        const searchWords = normalizedSearchName
          .split(' ')
          .filter((w) => w.length > 2);
        const venueWords = normalizedVenueName
          .split(' ')
          .filter((w) => w.length > 2);

        searchWords.forEach((searchWord) => {
          venueWords.forEach((venueWord) => {
            if (
              venueWord.includes(searchWord) ||
              searchWord.includes(venueWord)
            ) {
              score += 10;
            }
          });
        });
      }

      // Address matching
      if (normalizedSearchAddress && normalizedVenueAddress) {
        if (normalizedVenueAddress.includes(normalizedSearchAddress)) {
          score += 30;
        } else if (normalizedSearchAddress.includes(normalizedVenueAddress)) {
          score += 30;
        } else {
          // Word-by-word address matching
          const addressWords = normalizedSearchAddress
            .split(' ')
            .filter((w) => w.length > 2);
          addressWords.forEach((word) => {
            if (normalizedVenueAddress.includes(word)) {
              score += 5;
            }
          });
        }
      }

      // District matching
      if (extractedVenue.district && venue.district) {
        const normalizedExtractedDistrict = normalizeText(
          extractedVenue.district
        );
        const normalizedVenueDistrict = normalizeText(venue.district);
        if (normalizedVenueDistrict === normalizedExtractedDistrict) {
          score += 20;
        } else if (
          normalizedVenueDistrict.includes(normalizedExtractedDistrict) ||
          normalizedExtractedDistrict.includes(normalizedVenueDistrict)
        ) {
          score += 10;
        }
      }

      // City matching
      if (extractedVenue.city && venue.city) {
        const normalizedExtractedCity = normalizeText(extractedVenue.city);
        const normalizedVenueCity = normalizeText(venue.city);
        if (normalizedVenueCity === normalizedExtractedCity) {
          score += 15;
        } else if (
          normalizedVenueCity.includes(normalizedExtractedCity) ||
          normalizedExtractedCity.includes(normalizedVenueCity)
        ) {
          score += 8;
        }
      }

      return score;
    };

    // Find best matching venue
    let bestMatch: VenueMatch | null = null;
    let bestScore = 0;

    venues.forEach((v) => {
      const score = calculateMatchScore(v);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = v;
      }
    });

    // Only return match if score is above threshold
    if (bestMatch && bestScore >= 20) {
      console.log(
        `[AI] Matched venue: "${(bestMatch as VenueMatch).name}" (ID: ${(bestMatch as VenueMatch).id}) with score: ${bestScore} for extracted venue: "${extractedVenue.name}"`
      );
      return (bestMatch as VenueMatch).id;
    }

    console.log(
      `[AI] No matching venue found for: "${extractedVenue.name}" (best score was: ${bestScore})`
    );
    return null;
  }

  async generateText(prompt: string, language?: Language): Promise<string> {
    if (!this.ai) throw new Error('Gemini API key is missing.');

    let finalPrompt = prompt;
    if (language) {
      finalPrompt = `${this.getLanguageInstruction(language)}\n\n${prompt}`;
    }

    const response = await this.ai.models.generateContent({
      model: MODEL,
      contents: finalPrompt,
    });
    return response.text ?? '';
  }

  async extractSessionFromArticle(
    articleContent: string,
    language: Language = DEFAULT_LANGUAGE
  ): Promise<ExtractedSessionDto> {
    if (!this.ai) throw new Error('Gemini API key is missing.');

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
  "requiredLevels": "Array of short name strings for skill levels. Use EXACTLY these values: 'Y' (Yếu/Beginner=1), 'TBY' (Trung bình yếu/Advanced Beginner=2), 'TB-' (Trung bình-/Low Intermediate=3), 'TB' (Trung bình/Intermediate=4), 'TB+' (Trung bình+/High Intermediate=5), 'K' (Khá/Advanced=6), 'BC' (Bán chuyên/Semi Pro=7), 'CN' (Chuyên nghiệp/Pro=8). Mapping: Yếu→'Y', TBY/Trung bình yếu→'TBY', TB-/Trung bình-→'TB-', TB/Trung Bình→'TB', TB+→'TB+', Khá/K→'K', Mạnh/Giỏi/BC→'BC', Chuyên/Pro→'CN'. Return array like ['TB-','TB','TB+'] for a range. Return null if all levels welcome.",
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
- For Vietnamese level terms: Yếu→'Y', Trung bình yếu/TBY→'TBY', Trung bình-/TB-→'TB-', Trung bình/TB→'TB', Trung bình+/TB+→'TB+', Khá/K→'K', Bán chuyên/BC→'BC', Chuyên nghiệp→'CN'
- Phone numbers should be in format 0xxxxxxxxx
- Extract fees carefully: 'k' means thousand (50k = 50000)
- If a field cannot be determined, use null`;

    const response = await this.ai.models.generateContent({
      model: MODEL,
      contents: prompt,
    });

    const text = response.text ?? '';
    const cleanedText = text
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    const extracted = JSON.parse(cleanedText) as ExtractedSessionDto;

    // Convert requiredLevels from AI short name strings to numeric level IDs
    if (Array.isArray(extracted.requiredLevels)) {
      const numericLevels = (extracted.requiredLevels as unknown as string[])
        .map((s) => LEVEL_SHORT_NAME_MAP[s])
        .filter((n): n is number => n !== undefined);
      extracted.requiredLevels = [...new Set(numericLevels)].sort(
        (a, b) => a - b
      );
    }

    // Try to match venue in database
    if (extracted.venue) {
      const venueId = await this.findMatchingVenue(extracted.venue);
      if (venueId) {
        extracted.venueId = venueId;
      }
    }

    return extracted;
  }

  async chatWithAssistant(
    messages: ChatMessageDto[],
    pageContext?: string
  ): Promise<ReadableStream<Uint8Array>> {
    if (!this.ai) throw new Error('Gemini API key is missing.');

    let systemPrompt = VMITO_SYSTEM_PROMPT;
    if (pageContext) {
      systemPrompt += `\n\n## Context hiện tại\nNgười dùng đang ở trang: ${pageContext}`;
    }

    const history = messages.slice(0, -1).map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1];

    const chat = this.ai.chats.create({
      model: MODEL,
      config: { systemInstruction: systemPrompt },
      history,
    });

    const stream = await chat.sendMessageStream({
      message: lastMessage.content,
    });

    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.text ?? '';
            if (text) controller.enqueue(encoder.encode(text));
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
