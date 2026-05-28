import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type as GenAIType } from '@google/genai';
import {
  ChatMessageDto,
  ExtractedCourt,
  ExtractedSessionDto,
  ExtractedVenue,
} from './dto/extract-session.dto';
import { Language, DEFAULT_LANGUAGE } from '../common/constants/language.enum';
import { PrismaService } from '../prisma/prisma.service';
import { removeVietnameseTones } from '../common/utils/string.utils';

const MODEL = 'gemini-3.1-flash-lite';
const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const VIETNAM_UTC_OFFSET = '+07:00';
const DEFAULT_MAX_PLAYERS_PER_COURT = 8;
const VENUE_MATCH_THRESHOLD = 60;
const GEMINI_MAX_RETRIES = 3;
const GEMINI_INITIAL_DELAY_MS = 1000;

type RawExtractedVenue = {
  placeId?: string | null;
  name?: string | null;
  address?: string | null;
  district?: string | null;
  city?: string | null;
  newAddress?: string | null;
  newDistrict?: string | null;
  newCity?: string | null;
};

type RawExtractedCourt = {
  courtNumber?: number | string | null;
  courtName?: string | null;
  direction?: 'HORIZONTAL' | 'VERTICAL' | null;
};

type RawExtractedSession = {
  name?: string | null;
  description?: string | null;
  notes?: string | null;
  location?: string | null;
  hostName?: string | null;
  hostPhone?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  sessionDuration?: number | string | null;
  maxPlayersPerCourt?: number | string | null;
  requiredLevels?: Array<string | number> | string | number | null;
  venue?: RawExtractedVenue | null;
  venueId?: string | null;
  numberOfCourts?: number | string | null;
  courts?: RawExtractedCourt[] | null;
  courtNames?: Array<string | number> | null;
  shuttlecock?: string | null;
  defaultMatchType?: string | null;
  feeConfig?: {
    feeType?: string | null;
    maleFee?: number | string | null;
    femaleFee?: number | string | null;
    notes?: string | null;
  } | null;
};

type VenueMatch = {
  id: string;
  name: string;
  acronym: string | null;
  address: string;
  district: string | null;
  city: string | null;
  newAddress: string | null;
  newDistrict: string | null;
  newCity: string | null;
  searchTerms: string | null;
};

type VenueMatchResult = {
  venue: VenueMatch;
  score: number;
};

const nullableStringSchema = { type: GenAIType.STRING, nullable: true };
const nullableIntegerSchema = { type: GenAIType.INTEGER, nullable: true };

const SESSION_EXTRACTION_SCHEMA = {
  type: GenAIType.OBJECT,
  properties: {
    name: nullableStringSchema,
    description: nullableStringSchema,
    notes: nullableStringSchema,
    location: nullableStringSchema,
    hostName: nullableStringSchema,
    hostPhone: nullableStringSchema,
    startTime: nullableStringSchema,
    endTime: nullableStringSchema,
    sessionDuration: nullableIntegerSchema,
    maxPlayersPerCourt: nullableIntegerSchema,
    requiredLevels: {
      type: GenAIType.ARRAY,
      nullable: true,
      items: { type: GenAIType.STRING },
    },
    venue: {
      type: GenAIType.OBJECT,
      nullable: true,
      properties: {
        placeId: nullableStringSchema,
        name: nullableStringSchema,
        address: nullableStringSchema,
        district: nullableStringSchema,
        city: nullableStringSchema,
        newAddress: nullableStringSchema,
        newDistrict: nullableStringSchema,
        newCity: nullableStringSchema,
      },
    },
    venueId: nullableStringSchema,
    numberOfCourts: nullableIntegerSchema,
    courts: {
      type: GenAIType.ARRAY,
      nullable: true,
      items: {
        type: GenAIType.OBJECT,
        properties: {
          courtNumber: nullableIntegerSchema,
          courtName: nullableStringSchema,
          direction: {
            type: GenAIType.STRING,
            nullable: true,
            enum: ['HORIZONTAL', 'VERTICAL'],
          },
        },
      },
    },
    courtNames: {
      type: GenAIType.ARRAY,
      nullable: true,
      items: { type: GenAIType.STRING },
    },
    shuttlecock: nullableStringSchema,
    defaultMatchType: {
      type: GenAIType.STRING,
      nullable: true,
      enum: ['SINGLES', 'DOUBLES'],
    },
    feeConfig: {
      type: GenAIType.OBJECT,
      nullable: true,
      properties: {
        feeType: {
          type: GenAIType.STRING,
          nullable: true,
          enum: ['FIXED', 'SPLIT_EVENLY'],
        },
        maleFee: nullableIntegerSchema,
        femaleFee: nullableIntegerSchema,
        notes: nullableStringSchema,
      },
    },
  },
  required: [
    'name',
    'description',
    'notes',
    'location',
    'hostName',
    'hostPhone',
    'startTime',
    'endTime',
    'sessionDuration',
    'maxPlayersPerCourt',
    'requiredLevels',
    'venue',
    'venueId',
    'numberOfCourts',
    'courts',
    'courtNames',
    'shuttlecock',
    'defaultMatchType',
    'feeConfig',
  ],
  propertyOrdering: [
    'name',
    'description',
    'notes',
    'location',
    'hostName',
    'hostPhone',
    'startTime',
    'endTime',
    'sessionDuration',
    'maxPlayersPerCourt',
    'requiredLevels',
    'venue',
    'venueId',
    'numberOfCourts',
    'courts',
    'courtNames',
    'shuttlecock',
    'defaultMatchType',
    'feeConfig',
  ],
};

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
    timeZone: VIETNAM_TIME_ZONE,
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

  private normalizeTextValue(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized || normalized.toLowerCase() === 'null') return undefined;
    return normalized;
  }

  private normalizeInteger(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.round(value);
    }
    if (typeof value !== 'string') return undefined;
    const digits = value.match(/\d+/g)?.join('');
    if (!digits) return undefined;
    const parsed = Number.parseInt(digits, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private normalizeMoney(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const rounded = Math.round(value);
      return rounded > 0 && rounded < 1000 ? rounded * 1000 : rounded;
    }
    if (typeof value !== 'string') return undefined;

    const normalized = value.toLowerCase().trim();
    const numberText = normalized.replace(/[^\d.,k]/g, '').replace(/,/g, '.');
    if (!numberText) return undefined;

    if (numberText.includes('k')) {
      const parsed = Number.parseFloat(numberText.replace('k', ''));
      return Number.isFinite(parsed) ? Math.round(parsed * 1000) : undefined;
    }

    const digits = normalized.match(/\d+/g)?.join('');
    if (!digits) return undefined;
    const parsed = Number.parseInt(digits, 10);
    if (!Number.isFinite(parsed)) return undefined;
    return parsed > 0 && parsed < 1000 ? parsed * 1000 : parsed;
  }

  private normalizePhone(value: unknown): string | undefined {
    const raw = this.normalizeTextValue(value);
    if (!raw) return undefined;
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('84') && digits.length >= 11) {
      digits = `0${digits.slice(2)}`;
    }
    if (!digits.startsWith('0') && digits.length === 9) {
      digits = `0${digits}`;
    }
    return digits.length >= 10 ? digits : undefined;
  }

  private normalizeDateTime(value: unknown): string | undefined {
    const raw = this.normalizeTextValue(value);
    if (!raw) return undefined;

    const valueWithOffset = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw)
      ? raw
      : `${raw}${VIETNAM_UTC_OFFSET}`;
    const date = new Date(valueWithOffset);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
  }

  private calculateDurationMinutes(
    startTime?: string,
    endTime?: string
  ): number | undefined {
    if (!startTime || !endTime) return undefined;
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      return undefined;
    }
    return Math.round((end - start) / 60000);
  }

  private normalizeLevelToken(value: string): number[] {
    const normalized = removeVietnameseTones(value)
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
    const compact = normalized.replace(/\s+/g, '');

    const matches: number[] = [];
    const add = (level: number) => {
      if (!matches.includes(level)) matches.push(level);
    };

    if (/\bY\b|YEU|BEGINNER/.test(normalized)) add(1);
    if (compact.includes('TBY') || compact.includes('TRUNGBINHYEU')) add(2);
    if (compact.includes('TB-') || compact.includes('TRUNGBINH-')) add(3);
    if (compact.includes('TB+') || compact.includes('TRUNGBINH+')) add(5);
    if (
      /\bTB\b/.test(normalized) ||
      (compact.includes('TRUNGBINH') &&
        !compact.includes('TRUNGBINHYEU') &&
        !compact.includes('TRUNGBINH-') &&
        !compact.includes('TRUNGBINH+'))
    ) {
      add(4);
    }
    if (/\bK\b|KHA|ADVANCED/.test(normalized)) add(6);
    if (/\bBC\b|BAN CHUYEN|BAN-CHUYEN|MANH|GIOI|SEMIPRO/.test(normalized)) {
      add(7);
    }
    if (/\bCN\b|CHUYEN NGHIEP|CHUYENNGHIEP|PRO/.test(normalized)) add(8);

    if (
      matches.length >= 2 &&
      /\b(DEN|TO|THRU|THROUGH)\b|[-–—]/.test(normalized)
    ) {
      const start = Math.min(...matches);
      const end = Math.max(...matches);
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }

    return matches;
  }

  private normalizeRequiredLevels(
    value: RawExtractedSession['requiredLevels']
  ): number[] | undefined {
    if (value === null || value === undefined) return undefined;
    const values = Array.isArray(value) ? value : [value];
    const levels = values.flatMap((item) => {
      if (typeof item === 'number' && item >= 1 && item <= 8) return [item];
      if (typeof item !== 'string') return [];
      const direct = LEVEL_SHORT_NAME_MAP[item];
      if (direct) return [direct];
      return this.normalizeLevelToken(item);
    });
    const unique = [...new Set(levels)].filter(
      (level) => level >= 1 && level <= 8
    );
    return unique.length > 0 ? unique.sort((a, b) => a - b) : undefined;
  }

  private normalizeVenue(
    venue?: RawExtractedVenue | null
  ): ExtractedVenue | undefined {
    if (!venue) return undefined;
    const normalized: ExtractedVenue = {
      placeId: this.normalizeTextValue(venue.placeId),
      name: this.normalizeTextValue(venue.name),
      address: this.normalizeTextValue(venue.address),
      district: this.normalizeTextValue(venue.district),
      city: this.normalizeTextValue(venue.city),
      newAddress: this.normalizeTextValue(venue.newAddress),
      newDistrict: this.normalizeTextValue(venue.newDistrict),
      newCity: this.normalizeTextValue(venue.newCity),
    };
    return Object.values(normalized).some(Boolean) ? normalized : undefined;
  }

  private normalizeCourts(
    rawCourts?: RawExtractedCourt[] | null,
    courtNames?: Array<string | number> | null
  ): ExtractedCourt[] | undefined {
    if (Array.isArray(rawCourts) && rawCourts.length > 0) {
      const courts = rawCourts
        .map((court, index): ExtractedCourt => {
          const courtNumber =
            this.normalizeInteger(court.courtNumber) ?? index + 1;
          return {
            courtNumber,
            courtName: this.normalizeTextValue(court.courtName),
            direction:
              court.direction === 'VERTICAL' ? 'VERTICAL' : 'HORIZONTAL',
          };
        })
        .filter((court) => court.courtNumber > 0);
      return courts.length > 0 ? courts : undefined;
    }

    if (!Array.isArray(courtNames) || courtNames.length === 0) return undefined;
    const courts = courtNames
      .map((name, index): ExtractedCourt | null => {
        const courtName = this.normalizeTextValue(String(name));
        if (!courtName) return null;
        const numericCourt = /^\d+$/.test(courtName)
          ? Number.parseInt(courtName, 10)
          : undefined;
        return {
          courtNumber: numericCourt ?? index + 1,
          courtName,
          direction: 'HORIZONTAL' as const,
        };
      })
      .filter((court): court is ExtractedCourt => court !== null);

    return courts.length > 0 ? courts : undefined;
  }

  private buildLocationFallback(
    location?: string,
    venue?: ExtractedVenue
  ): string | undefined {
    if (location) return location;
    if (venue?.name && venue.address) return `${venue.name}, ${venue.address}`;
    return venue?.address || venue?.name;
  }

  private canonicalVenue(venue: VenueMatch): ExtractedVenue {
    return {
      name: venue.name,
      address: venue.address,
      district: venue.district ?? undefined,
      city: venue.city ?? undefined,
      newAddress: venue.newAddress ?? undefined,
      newDistrict: venue.newDistrict ?? undefined,
      newCity: venue.newCity ?? undefined,
    };
  }

  private normalizeExtractedSession(
    raw: RawExtractedSession
  ): ExtractedSessionDto {
    const startTime = this.normalizeDateTime(raw.startTime);
    const endTime = this.normalizeDateTime(raw.endTime);
    const durationFromTime = this.calculateDurationMinutes(startTime, endTime);
    const requiredLevels = this.normalizeRequiredLevels(raw.requiredLevels);
    const courtNames = Array.isArray(raw.courtNames)
      ? raw.courtNames
          .map((name) => this.normalizeTextValue(String(name)))
          .filter((name): name is string => Boolean(name))
      : undefined;
    const courts = this.normalizeCourts(raw.courts, raw.courtNames);
    const venue = this.normalizeVenue(raw.venue);
    const location = this.buildLocationFallback(
      this.normalizeTextValue(raw.location),
      venue
    );
    const sessionDuration =
      durationFromTime ?? this.normalizeInteger(raw.sessionDuration);
    const numberOfCourts =
      courts?.length ?? this.normalizeInteger(raw.numberOfCourts);
    const feeType =
      raw.feeConfig?.feeType === 'SPLIT_EVENLY' ? 'SPLIT_EVENLY' : 'FIXED';
    const maleFee = this.normalizeMoney(raw.feeConfig?.maleFee);
    const femaleFee = this.normalizeMoney(raw.feeConfig?.femaleFee);
    const feeNotes = this.normalizeTextValue(raw.feeConfig?.notes);
    const hasFee =
      raw.feeConfig &&
      (raw.feeConfig.feeType ||
        maleFee !== undefined ||
        femaleFee !== undefined ||
        feeNotes);

    return {
      name: this.normalizeTextValue(raw.name),
      description: this.normalizeTextValue(raw.description),
      notes: this.normalizeTextValue(raw.notes),
      location,
      hostName: this.normalizeTextValue(raw.hostName),
      hostPhone: this.normalizePhone(raw.hostPhone),
      startTime,
      endTime,
      sessionDuration,
      maxPlayersPerCourt:
        this.normalizeInteger(raw.maxPlayersPerCourt) ??
        DEFAULT_MAX_PLAYERS_PER_COURT,
      requiredLevels,
      venue,
      venueId: this.normalizeTextValue(raw.venueId),
      numberOfCourts,
      courts,
      courtNames,
      shuttlecock: this.normalizeTextValue(raw.shuttlecock),
      defaultMatchType:
        raw.defaultMatchType === 'SINGLES' || raw.defaultMatchType === 'DOUBLES'
          ? raw.defaultMatchType
          : undefined,
      feeConfig: hasFee
        ? {
            feeType,
            maleFee,
            femaleFee,
            notes: feeNotes,
          }
        : undefined,
    };
  }

  private normalizeVenueSearchText(value?: string | null): string {
    if (!value) return '';
    return removeVietnameseTones(value)
      .toLowerCase()
      .replace(/\b(san cau long|scl|san|clb|cau long)\b/g, ' ')
      .replace(/\b(quan|huyen|thi xa|thanh pho|tp)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private scoreTextMatch(
    searchValue: string,
    candidateValue: string,
    weights: { exact: number; contains: number; token: number }
  ): number {
    if (!searchValue || !candidateValue) return 0;
    if (searchValue === candidateValue) return weights.exact;
    if (
      searchValue.includes(candidateValue) ||
      candidateValue.includes(searchValue)
    ) {
      return weights.contains;
    }

    const searchTokens = new Set(
      searchValue.split(' ').filter((t) => t.length > 1)
    );
    const candidateTokens = new Set(
      candidateValue.split(' ').filter((t) => t.length > 1)
    );
    if (searchTokens.size === 0 || candidateTokens.size === 0) return 0;

    const matchedTokens = [...searchTokens].filter((token) =>
      candidateTokens.has(token)
    ).length;
    const denominator = Math.max(searchTokens.size, candidateTokens.size);
    return Math.round((matchedTokens / denominator) * weights.token);
  }

  /**
   * Find best matching venue in database based on AI extracted venue data
   */
  private async findMatchingVenue(
    extractedVenue: ExtractedVenue
  ): Promise<VenueMatchResult | null> {
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
        acronym: true,
        address: true,
        district: true,
        city: true,
        newAddress: true,
        newDistrict: true,
        newCity: true,
        searchTerms: true,
      },
    });

    if (venues.length === 0) {
      return null;
    }

    // Helper function to calculate match score
    const calculateMatchScore = (venue: VenueMatch): number => {
      const searchName = this.normalizeVenueSearchText(extractedVenue.name);
      const searchAddress = this.normalizeVenueSearchText(
        extractedVenue.address
      );
      const searchDistrict = this.normalizeVenueSearchText(
        extractedVenue.district
      );
      const searchCity = this.normalizeVenueSearchText(extractedVenue.city);
      const searchCombined = this.normalizeVenueSearchText(
        [
          extractedVenue.name,
          extractedVenue.address,
          extractedVenue.district,
          extractedVenue.city,
          extractedVenue.newAddress,
          extractedVenue.newDistrict,
          extractedVenue.newCity,
        ]
          .filter(Boolean)
          .join(' ')
      );

      const venueName = this.normalizeVenueSearchText(venue.name);
      const venueAcronym = this.normalizeVenueSearchText(venue.acronym);
      const venueAddress = this.normalizeVenueSearchText(venue.address);
      const venueDistrict = this.normalizeVenueSearchText(venue.district);
      const venueCity = this.normalizeVenueSearchText(venue.city);
      const venueNewAddress = this.normalizeVenueSearchText(venue.newAddress);
      const venueNewDistrict = this.normalizeVenueSearchText(venue.newDistrict);
      const venueNewCity = this.normalizeVenueSearchText(venue.newCity);
      const venueSearchTerms = this.normalizeVenueSearchText(venue.searchTerms);

      return (
        this.scoreTextMatch(searchName, venueName, {
          exact: 100,
          contains: 70,
          token: 55,
        }) +
        this.scoreTextMatch(searchName, venueAcronym, {
          exact: 85,
          contains: 55,
          token: 25,
        }) +
        this.scoreTextMatch(searchAddress, venueAddress, {
          exact: 45,
          contains: 35,
          token: 30,
        }) +
        this.scoreTextMatch(searchAddress, venueNewAddress, {
          exact: 35,
          contains: 25,
          token: 20,
        }) +
        this.scoreTextMatch(searchDistrict, venueDistrict, {
          exact: 25,
          contains: 15,
          token: 12,
        }) +
        this.scoreTextMatch(searchDistrict, venueNewDistrict, {
          exact: 20,
          contains: 12,
          token: 10,
        }) +
        this.scoreTextMatch(searchCity, venueCity, {
          exact: 15,
          contains: 10,
          token: 8,
        }) +
        this.scoreTextMatch(searchCity, venueNewCity, {
          exact: 12,
          contains: 8,
          token: 6,
        }) +
        this.scoreTextMatch(searchCombined, venueSearchTerms, {
          exact: 45,
          contains: 35,
          token: 25,
        })
      );
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
    if (bestMatch && bestScore >= VENUE_MATCH_THRESHOLD) {
      console.log(
        `[AI] Matched venue: "${(bestMatch as VenueMatch).name}" (ID: ${(bestMatch as VenueMatch).id}) with score: ${bestScore} for extracted venue: "${extractedVenue.name}"`
      );
      return { venue: bestMatch as VenueMatch, score: bestScore };
    }

    console.log(
      `[AI] No matching venue found for: "${extractedVenue.name}" (best score was: ${bestScore})`
    );
    return null;
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === GEMINI_MAX_RETRIES - 1;
        if (isLastAttempt) break;

        const delayMs = GEMINI_INITIAL_DELAY_MS * 2 ** attempt;
        console.warn(
          `[AI] ${context} attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : String(error)}. Retrying in ${delayMs}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError;
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

    const prompt = `You are an AI assistant that extracts session information from Vietnamese sport recruitment posts for Vmito.

${languageInstruction}

Analyze the following article/post and extract every session detail that is explicitly present or strongly implied. The post is typically a recruitment for casual badminton players (tuyển vãng lai), but it may mention pickleball, tennis, football, or another sport.

Article content:
"""
${articleContent}
"""

Current date in Vietnam timezone: ${currentDate.date}

Return a JSON object that matches the provided schema. Use null for fields that cannot be determined.

Field guidance:
- name: Session name. If the post has no title, create a short descriptive name from venue + time, but do not invent hidden facts.
- description: Public details from the post that help players understand the session.
- notes: Operational/private notes, special rules, reminders, or fee caveats from the post.
- location: This is the Session.location / "Địa điểm" field shown in the session form. Extract the display location exactly as well as possible. Prefer venue name plus address/area if present, for example "Sân ABC, Quận 7" or "Sân ABC, 123 Nguyễn Văn Linh, Quận 7". Do not put unrelated notes here.
- venue: Structured venue data for matching against the database. venue.name is the court/venue name only; venue.address is the full address if available; district/city are administrative areas.
- startTime/endTime: ISO 8601 datetime strings. If only time is given (e.g. "18h-20h") and no calendar date is mentioned, combine it with current date ${currentDate.date}. If date is mentioned without year, use year ${currentDate.year}. Use Vietnam time.
- sessionDuration: Duration in minutes if explicitly stated or computable from startTime/endTime.
- requiredLevels: Array of level short labels. Use only: Y, TBY, TB-, TB, TB+, K, BC, CN. For ranges, include every level in the range, e.g. "TB- đến Khá" -> ["TB-","TB","TB+","K"]. Return null if all levels are welcome or no level is mentioned.
- numberOfCourts: Number of courts if mentioned. For "2 sân (3 và 4)", this is 2.
- courtNames: Actual specific court numbers/names from the post, not generated sequence numbers. For "2 sân (3 và 4)", return ["3","4"]; for "sân A và B", return ["A","B"].
- courts: If specific courts are known, return matching court objects. Numeric court names should use that actual number as courtNumber; non-numeric court names can use sequential courtNumber with courtName set.
- maxPlayersPerCourt: Use explicit value if mentioned; otherwise null.
- defaultMatchType: SINGLES only when the post clearly says singles/đơn; DOUBLES when it clearly says doubles/đôi; otherwise null.
- shuttlecock: Shuttlecock/ball type if mentioned.
- feeConfig: FIXED for per-player/gender prices; SPLIT_EVENLY for share/split after play. Extract VND numbers; "50k" means 50000. Put fee caveats in feeConfig.notes.

Important rules:
- Return JSON only.
- Do not invent venue, address, phone, prices, court names, or skill levels.
- Preserve Vietnamese field values when the post is Vietnamese.
- Phone numbers should be normalized to 0xxxxxxxxx when possible.
- If a field cannot be determined, use null.`;

    const response = await this.withRetry(
      () =>
        this.ai!.models.generateContent({
          model: MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: SESSION_EXTRACTION_SCHEMA,
            temperature: 0.1,
          },
        }),
      'extract-session'
    );

    const text = response.text ?? '';
    let rawExtracted: RawExtractedSession;
    try {
      rawExtracted = JSON.parse(text) as RawExtractedSession;
    } catch (error) {
      console.error('[AI] Failed to parse extract-session JSON:', {
        error: error instanceof Error ? error.message : String(error),
        text,
      });
      throw new Error('AI returned invalid session extraction JSON.');
    }

    const extracted = this.normalizeExtractedSession(rawExtracted);

    // Try to match venue in database
    if (extracted.venue) {
      const match = await this.findMatchingVenue(extracted.venue);
      if (match) {
        extracted.venueId = match.venue.id;
        extracted.venue = this.canonicalVenue(match.venue);
        extracted.location = this.buildLocationFallback(
          extracted.location,
          extracted.venue
        );
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
