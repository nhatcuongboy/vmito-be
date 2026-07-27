import { IsString } from 'class-validator';

export class ShareSessionResultsDto {
  @IsString()
  sessionId: string;
}
