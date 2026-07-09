import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { Language } from '../../common/constants/language.enum';

export class ExtractScheduleRequestDto {
  @IsString()
  @IsNotEmpty()
  tournamentId!: string;

  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsEnum(Language)
  @IsOptional()
  language?: Language;
}

export interface ExtractedScheduleEntry {
  /** Tên hạng mục như xuất hiện trong văn bản (ví dụ "Đôi nam"). */
  categoryName?: string;
  /** Số thứ tự trận trong hạng mục (matchNumber trong DB). */
  matchNumber?: number;
  /** Mã trận do host viết (ví dụ "MD-VB01", "M01"), khớp với matchCode trong DB. */
  matchCode?: string;
  /** Tên/mã đội thứ nhất khi dòng ghi theo "MD01 vs MD02" (ví dụ "MD01"). */
  team1Code?: string;
  /** Tên/mã đội thứ hai khi dòng ghi theo "MD01 vs MD02" (ví dụ "MD02"). */
  team2Code?: string;
  /** Tên sân hoặc số sân (ví dụ "Sân 1", "Court A"). */
  courtName?: string;
  /** Ngày thi đấu định dạng YYYY-MM-DD. */
  date?: string;
  /** Giờ bắt đầu định dạng HH:mm (24h). */
  startTime?: string;
  /** Thời lượng trận (phút). Mặc định 60 nếu không có. */
  durationMinutes?: number;
  /** Dòng/đoạn gốc trong input để host dễ debug. */
  rawLine?: string;
}

export interface ExtractScheduleResponseDto {
  entries: ExtractedScheduleEntry[];
}
