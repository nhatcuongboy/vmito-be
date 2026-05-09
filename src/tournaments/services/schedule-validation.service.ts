import { Injectable, BadRequestException } from '@nestjs/common';
import { GenerateScheduleDto } from '../dto/schedule-generation.dto';

interface ValidationError {
  field: string;
  message: string;
}

@Injectable()
export class ScheduleValidationService {
  validate(dto: GenerateScheduleDto, roundTypes: string[]): ValidationError[] {
    const errors: ValidationError[] = [];

    // Must have at least one time slot
    if (!dto.timeSlots || dto.timeSlots.length === 0) {
      errors.push({
        field: 'timeSlots',
        message: 'At least one time slot is required',
      });
    }

    // Must have at least one court assigned
    const hasAnyCourt = dto.timeSlots?.some(
      (ts) => ts.courts && ts.courts.length > 0
    );
    if (!hasAnyCourt) {
      errors.push({
        field: 'timeSlots.courts',
        message: 'At least one court must be assigned to a time slot',
      });
    }

    // Validate time ranges
    for (let i = 0; i < (dto.timeSlots?.length || 0); i++) {
      const slot = dto.timeSlots[i];

      const startMinutes = this.timeToMinutes(slot.startTime);
      const endMinutes = this.timeToMinutes(slot.endTime);

      if (endMinutes <= startMinutes) {
        errors.push({
          field: `timeSlots[${i}]`,
          message: `End time (${slot.endTime}) must be after start time (${slot.startTime})`,
        });
      }
    }

    // Validate match durations for round types present
    if (roundTypes.length > 0) {
      const hasPoolPlay = roundTypes.some((r) => r === 'GROUP');
      const hasPlayoffs = roundTypes.some((r) => r !== 'GROUP');

      if (hasPoolPlay && !dto.matchDurations?.POOL_PLAY) {
        errors.push({
          field: 'matchDurations.POOL_PLAY',
          message: 'Pool Play match duration is required',
        });
      }
      if (hasPlayoffs && !dto.matchDurations?.PLAYOFFS) {
        errors.push({
          field: 'matchDurations.PLAYOFFS',
          message: 'Playoffs match duration is required',
        });
      }
    }

    // Validate no overlapping time slots for same courts on same date
    this.validateTimeSlotOverlaps(dto, errors);

    // Validate duration values in 5-minute increments
    if (dto.matchDurations) {
      if (dto.matchDurations.POOL_PLAY % 5 !== 0) {
        errors.push({
          field: 'matchDurations.POOL_PLAY',
          message: 'Pool Play duration must be in 5-minute increments',
        });
      }
      if (dto.matchDurations.PLAYOFFS % 5 !== 0) {
        errors.push({
          field: 'matchDurations.PLAYOFFS',
          message: 'Playoffs duration must be in 5-minute increments',
        });
      }
    }

    return errors;
  }

  throwIfInvalid(dto: GenerateScheduleDto, roundTypes: string[]): void {
    const errors = this.validate(dto, roundTypes);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors,
      });
    }
  }

  private validateTimeSlotOverlaps(
    dto: GenerateScheduleDto,
    errors: ValidationError[]
  ): void {
    for (let i = 0; i < dto.timeSlots.length; i++) {
      for (let j = i + 1; j < dto.timeSlots.length; j++) {
        const slotA = dto.timeSlots[i];
        const slotB = dto.timeSlots[j];

        // Only check same date
        if (slotA.date !== slotB.date) continue;

        // Check if they share courts
        const courtIdsA = new Set(slotA.courts.map((c) => c.courtId));
        const sharedCourts = slotB.courts.filter((c) =>
          courtIdsA.has(c.courtId)
        );
        if (sharedCourts.length === 0) continue;

        // Check time overlap
        const startA = this.timeToMinutes(slotA.startTime);
        const endA = this.timeToMinutes(slotA.endTime);
        const startB = this.timeToMinutes(slotB.startTime);
        const endB = this.timeToMinutes(slotB.endTime);

        if (startA < endB && startB < endA) {
          errors.push({
            field: `timeSlots[${i}], timeSlots[${j}]`,
            message: `Time slots on ${slotA.date} overlap for shared courts`,
          });
        }
      }
    }
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
}
