import {
  IsString,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
} from 'class-validator';

@ValidatorConstraint({ name: 'xorPlayerOrPair', async: false })
class XorPlayerOrPairConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateCategoryRegistrationDto;
    const hasPlayer = !!dto.tournamentPlayerId;
    const hasPair = !!dto.tournamentPairId;
    return hasPlayer !== hasPair;
  }

  defaultMessage(): string {
    return 'Exactly one of tournamentPlayerId or tournamentPairId must be provided, not both and not neither';
  }
}

export class CreateCategoryRegistrationDto {
  @ValidateIf((o: CreateCategoryRegistrationDto) => !o.tournamentPairId)
  @IsString()
  tournamentPlayerId?: string;

  @ValidateIf((o: CreateCategoryRegistrationDto) => !o.tournamentPlayerId)
  @IsString()
  tournamentPairId?: string;

  @Validate(XorPlayerOrPairConstraint)
  readonly xorValidation?: undefined;
}
