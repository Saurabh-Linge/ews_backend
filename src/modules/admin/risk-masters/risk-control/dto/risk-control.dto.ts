import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRiskControlDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  is_active?: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}

export class CreateRiskControlKeyAspectDto {
  @IsInt()
  risk_control_id!: number;

  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  is_active?: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}
