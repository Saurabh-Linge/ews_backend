import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAuditAnnexureDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsInt()
  risk_defination_id!: number;

  @IsNotEmpty()
  @IsInt()
  risk_category_id!: number;

  @IsNotEmpty()
  @IsInt()
  business_risk!: number;

  @IsNotEmpty()
  @IsInt()
  control_risk!: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}

export class CreateAuditAnnexureColumnDto {
  @IsNotEmpty()
  @IsInt()
  annexure_id!: number;

  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsInt()
  column_type_id!: number;

  @IsOptional()
  @IsArray()
  options?: string[];

  @IsOptional()
  @IsInt()
  admin_id?: number;
}
