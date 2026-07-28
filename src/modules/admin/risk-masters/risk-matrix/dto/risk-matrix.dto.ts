import { IsArray, IsInt, ValidateNested } from 'class-validator';

import { Type } from 'class-transformer';

export class RiskMatrixRowDto {
  @IsInt()
  risk_parameter!: number;

  @IsInt()
  business_risk_app!: number;

  @IsInt()
  business_risk_score!: number;

  @IsInt()
  control_risk_app!: number;

  @IsInt()
  control_risk_score!: number;

  @IsInt()
  residual_risk_app!: number;
}

export class CreateRiskMatrixDto {
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => RiskMatrixRowDto)
  rows!: RiskMatrixRowDto[];
}
