import { Injectable } from '@nestjs/common';
import { Type as GenAIType } from '@google/genai';
import { VenueCustomerType, VenueDayType } from '@prisma/client';
import { GeminiService } from './gemini.service';
import { ExtractPriceRulesResponseDto } from './dto/extract-price-rules.dto';
import {
  normalizeExtractedPriceRule,
  RawExtractedPriceRule,
} from './price-rules-extraction.util';
import { DEFAULT_LANGUAGE, Language } from '../common/constants/language.enum';

const nullableString = { type: GenAIType.STRING, nullable: true };
const nullableInteger = { type: GenAIType.INTEGER, nullable: true };

const PRICE_RULES_SCHEMA = {
  type: GenAIType.OBJECT,
  properties: {
    rules: {
      type: GenAIType.ARRAY,
      items: {
        type: GenAIType.OBJECT,
        properties: {
          dayType: {
            type: GenAIType.STRING,
            enum: Object.values(VenueDayType),
          },
          daysOfWeek: {
            type: GenAIType.ARRAY,
            items: { type: GenAIType.INTEGER },
          },
          specificDate: nullableString,
          startTime: { type: GenAIType.STRING },
          endTime: { type: GenAIType.STRING },
          customerType: {
            type: GenAIType.STRING,
            enum: Object.values(VenueCustomerType),
          },
          pricePerHour: { type: GenAIType.INTEGER },
          minimumMinutes: nullableInteger,
          billingStepMinutes: nullableInteger,
          notes: nullableString,
          rawLine: nullableString,
        },
        required: [
          'dayType',
          'daysOfWeek',
          'startTime',
          'endTime',
          'customerType',
          'pricePerHour',
        ],
      },
    },
    warnings: { type: GenAIType.ARRAY, items: { type: GenAIType.STRING } },
  },
  required: ['rules', 'warnings'],
};

const LANGUAGE_NAMES: Record<Language, string> = {
  [Language.VI]: 'Vietnamese',
  [Language.EN]: 'English',
  [Language.CN]: 'Chinese',
};

const getTodayInVietnam = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date()
  );

@Injectable()
export class PriceRulesExtractionService {
  constructor(private readonly gemini: GeminiService) {}

  async extract(
    text: string,
    language: Language = DEFAULT_LANGUAGE
  ): Promise<ExtractPriceRulesResponseDto> {
    const parsed = await this.gemini.generateJson<{
      rules?: RawExtractedPriceRule[];
      warnings?: unknown[];
    }>(
      this.buildPrompt(text, language),
      PRICE_RULES_SCHEMA,
      'extract-price-rules'
    );

    const rules: ExtractPriceRulesResponseDto['rules'] = [];
    const skippedLines: string[] = [];
    for (const raw of Array.isArray(parsed.rules) ? parsed.rules : []) {
      const rule = normalizeExtractedPriceRule(raw);
      if (rule) rules.push(rule);
      else if (typeof raw.rawLine === 'string') skippedLines.push(raw.rawLine);
    }

    const warnings = (Array.isArray(parsed.warnings) ? parsed.warnings : [])
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);

    return { rules, warnings, skippedLines };
  }

  private buildPrompt(text: string, language: Language) {
    return `You convert a badminton/pickleball court rental price list, pasted by a venue manager for Vmito, into structured price rules.

Today (Vietnam): ${getTodayInVietnam()}. If a date has no year, use the current year.
Write "warnings" in ${LANGUAGE_NAMES[language]}.

Input (free text, table, chat message or OCR output):
"""
${text}
"""

Return one rule per (day scope × time range × customer type × price):
- dayType:
  - EVERYDAY: applies to all 7 days ("hằng ngày", "mỗi ngày", "T2-CN", "cả tuần").
  - WEEKDAY: specific days of week, listed in daysOfWeek ("T2-T6", "thứ 2,4,6", "T7, CN").
  - WEEKEND: only when the text literally says weekend ("cuối tuần", "weekend").
  - HOLIDAY: a public holiday with a known date (needs specificDate).
  - SPECIFIC_DATE: one specific calendar date (needs specificDate).
- daysOfWeek: 1=Monday (T2/Thứ 2) … 6=Saturday (T7) and 7=Sunday (CN/Chủ nhật). Empty unless dayType is WEEKDAY.
- specificDate: YYYY-MM-DD for HOLIDAY/SPECIFIC_DATE, else null. If a holiday has no clear date, skip that rule and mention it in warnings.
- startTime / endTime: 24h "HH:mm". "5h" = "05:00", "17h30" = "17:30", end of day = "24:00". If a range crosses midnight, split it into two rules.
- customerType:
  - WALK_IN: "vãng lai", "khách lẻ", "walk-in", or when no customer type is given.
  - FIXED: "cố định", "khách cố định", "tháng", "fixed", "long-term".
  - STUDENT: "HSSV", "học sinh", "sinh viên", "student".
  - MEMBER: "thành viên", "hội viên", "member".
  - CUSTOM: any other named customer group (put the group name in notes).
- pricePerHour: integer VND per court per hour. "80k" = 80000, "1tr2" = 1200000, "80.000đ" = 80000. If the source price is per 30 minutes or per multi-hour block, convert it to per hour and say so in warnings.
- minimumMinutes: minimum booking length in minutes if stated, else null.
- billingStepMinutes: billing increment in minutes if stated ("làm tròn 30 phút"), else null.
- notes: short extra conditions for that rule (e.g. "bao gồm nước"), else null.
- rawLine: the source line this rule came from, copied verbatim.

Rules:
- Return JSON only, matching the schema.
- Never invent prices, times or days that are not in the input.
- Skip headers, phone numbers, addresses, promotions without a clear price, and decorative lines.
- Use "warnings" for anything ambiguous you had to assume (max 5 short items).`;
  }
}
