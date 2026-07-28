import { ApiHideProperty } from '@nestjs/swagger';
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

  /**
   * Not a request field. It exists only to hang the XOR constraint on, because
   * class-validator needs a property to attach `@Validate` to.
   *
   * `@ApiHideProperty` keeps it out of the OpenAPI document: its declared type
   * is `undefined`, which the Swagger CLI plugin cannot map, so it falls back
   * to a self-reference and `createDocument` throws a circular-dependency error
   * at boot.
   */
  @ApiHideProperty()
  @Validate(XorPlayerOrPairConstraint)
  readonly xorValidation?: undefined;
}
