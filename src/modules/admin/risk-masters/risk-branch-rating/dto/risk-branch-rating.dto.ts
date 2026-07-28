import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateBranchRatingDto {
  @IsInt()
  year_id!: number;

  @IsInt()
  audit_unit_id!: number;

  @IsInt()
  audit_type_id!: number;

  // HIGH RISK

  @IsNotEmpty()
  @IsString()
  high_range_from!: string;

  @IsNotEmpty()
  @IsString()
  high_range_to!: string;

  // MEDIUM RISK

  @IsNotEmpty()
  @IsString()
  medium_range_from!: string;

  @IsNotEmpty()
  @IsString()
  medium_range_to!: string;

  // LOW RISK

  @IsNotEmpty()
  @IsString()
  low_range_from!: string;

  @IsNotEmpty()
  @IsString()
  low_range_to!: string;

  @IsOptional()
  @IsInt()
  is_active?: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}
