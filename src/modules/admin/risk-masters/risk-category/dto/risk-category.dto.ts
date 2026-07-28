import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
} from 'class-validator';

export class CreateRiskCategoryDto {
  @IsNotEmpty()
  @IsString()
  risk_category!: string;

  @IsOptional()
  @IsInt()
  is_active?: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;

  @IsOptional()
  @IsInt()
  risk_weight?: number;

  @IsOptional()
  @IsInt()
  risk_appetite_percent_from?: number;

  @IsOptional()
  @IsInt()
  risk_appetite_percent_to?: number;
}

export class UpdateRiskCategoryDto {
  @IsOptional()
  @IsString()
  risk_category?: string;

  @IsOptional()
  @IsInt()
  is_active?: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}

export class CreateRiskCategoryWeightDto {
  @IsInt()
  risk_category_id!: number;

  @IsInt()
  year_id!: number;

  @IsInt()
  risk_weight!: number;

  @IsNumber()
  risk_appetite_percent!: number;

  @IsOptional()
  @IsInt()
  is_active?: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}
