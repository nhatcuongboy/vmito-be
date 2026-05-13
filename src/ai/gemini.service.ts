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

const getDatePartsInVietnam = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');

  return {
    year,
    date: `${year}-${month}-${day}`,
  };
};

const VMITO_SYSTEM_PROMPT = `You are Vmito's AI Assistant.

## About Vmito
Vmito helps users organize and join sport sessions such as badminton, pickleball, tennis, and football.

Core capabilities:
- Create sessions: organize a play session, invite players, choose venues, set time, fees, and skill requirements.
- Join sessions: find available sessions and register to play.
- Manage sessions: approve players, assign players to courts, call matches, update results, and share sessions.
- Manage clubs/groups: create groups, approve members, manage members, and organize recurring play schedules.
- Manage payments: configure payment settings, track player payments, approve or reject transactions, and support fixed or split fees.
- Manage tournaments: create tournaments, add players or pairs, generate schedules, and view standings/results.
- Browse venues: find venues, view venue details, and open map directions.
- View profiles/history: manage personal information, language settings, ratings, and play history.

## User roles
- Host: organizes sessions, invites players, approves registrations, manages fees and courts.
- Player: joins sessions and tracks personal play/payment history.
- Admin: manages system data and moderation.

## Skill levels
When discussing player skill levels, prefer these short labels instead of raw numbers:
- Y = Beginner
- TBY = Advanced beginner
- TB- = Low intermediate
- TB = Intermediate
- TB+ = High intermediate
- Khá = Advanced
- BC = Semi pro
- CN = Pro

## Answering guidance
- Keep answers concise, clear, practical, and app-specific.
- If page context is provided, prioritize help that matches the current page.
- If you do not have access to a user's private data or exact app state, explain how they can check or perform the action in the app.
- Do not claim that a feature exists unless it is listed above or present in the user's context.
- Avoid unnecessary formatting and keep steps short.`;

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

  private getAssistantLanguageInstruction(language: Language): string {
    const languageNames = {
      [Language.VI]: 'Vietnamese (Tiếng Việt)',
      [Language.EN]: 'English',
      [Language.CN]: 'Chinese (中文)',
    };

    return `## Language rule
You MUST answer in ${languageNames[language]} because this is the user's selected app language.
This rule overrides the language used in the user's message, chat history, or page context.
Only use another language if the user explicitly asks you to translate, compare languages, or explain wording in another language.`;
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

    const currentDate = getDatePartsInVietnam();
    const languageInstruction = this.getLanguageInstruction(language);

    const prompt = `You are an AI assistant that extracts badminton session information from recruitment posts.

${languageInstruction}

Analyze the following article/post and extract session details. The post is typically a recruitment for casual badminton players (tuyển vãng lai).

Article content:
"""
${articleContent}
"""

Current date in Vietnam timezone: ${currentDate.date}

Extract and return a JSON object with the following fields (use null for fields that cannot be determined):

{
  "name": "Session name - create a short descriptive name based on venue and time if not explicitly stated",
  "description": "Additional details or notes from the post",
  "hostName": "Name of the host/organizer",
  "hostPhone": "Phone number of the host (format: 0xxxxxxxxx)",
  "startTime": "ISO 8601 datetime string. If the post does not mention a calendar date, use current date ${currentDate.date}. If it mentions date without year, use year ${currentDate.year}.",
  "endTime": "ISO 8601 datetime string. If the post does not mention a calendar date, use current date ${currentDate.date}. If it mentions date without year, use year ${currentDate.year}.",
  "maxPlayersPerCourt": "Number of max players per court (default 8 if not specified)",
  "requiredLevels": "Array of short name strings for skill levels. Use EXACTLY these values: 'Y' (Yếu/Beginner=1), 'TBY' (Trung bình yếu/Advanced Beginner=2), 'TB-' (Trung bình-/Low Intermediate=3), 'TB' (Trung bình/Intermediate=4), 'TB+' (Trung bình+/High Intermediate=5), 'K' (Khá/Advanced=6), 'BC' (Bán chuyên/Semi Pro=7), 'CN' (Chuyên nghiệp/Pro=8). Mapping: Yếu→'Y', TBY/Trung bình yếu→'TBY', TB-/Trung bình-→'TB-', TB/Trung Bình→'TB', TB+→'TB+', Khá/K→'K', Mạnh/Giỏi/BC→'BC', Chuyên/Pro→'CN'. Return array like ['TB-','TB','TB+'] for a range. Return null if all levels welcome.",
  "numberOfCourts": "Number of courts if mentioned. For text like '2 sân (3 và 4)', numberOfCourts is 2.",
  "courtNames": "Array of the actual specific court numbers/names mentioned, not sequential indexes. For text like '2 sân (3 và 4)', return ['3','4']; for 'sân 5,6', return ['5','6']; for 'sân A và B', return ['A','B']. Return null if specific courts are not specified.",
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
- For time, if only time is given (e.g., "18h-20h") and no calendar date is mentioned, combine it with current date ${currentDate.date}
- Never invent sequential court numbers. If the post says "2 sân (3 và 4)", this means two courts whose actual court numbers are 3 and 4.
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
    pageContext?: string,
    language: Language = DEFAULT_LANGUAGE
  ): Promise<ReadableStream<Uint8Array>> {
    if (!this.ai) throw new Error('Gemini API key is missing.');

    let systemPrompt = `${this.getAssistantLanguageInstruction(language)}\n\n${VMITO_SYSTEM_PROMPT}`;
    if (pageContext) {
      systemPrompt += `\n\n## Current page context\nThe user is currently on: ${pageContext}`;
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
