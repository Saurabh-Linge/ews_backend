import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRiskCompositeDto {
  @IsInt()
  business_risk!: number;

  @IsInt()
  control_risk!: number;

  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}
