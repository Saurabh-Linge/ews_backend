import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateAuditUnitDto {
  @IsInt()
  section_type_id!: number;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-zA-Z0-9]+$/)
  audit_unit_code!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-zA-Z0-9 ]+$/)
  name!: string;

  @IsInt()
  branch_head_id!: number;

  @IsOptional()
  @IsInt()
  branch_subhead_id?: number;

  @IsOptional()
  @IsInt()
  frequency?: number;

  @IsNotEmpty()
  @IsString()
  last_audit_date!: string;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}

export class UpdateAuditUnitDto {
  @IsOptional()
  @IsInt()
  section_type_id?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9]+$/)
  audit_unit_code?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9 ]+$/)
  name?: string;

  @IsOptional()
  @IsInt()
  branch_head_id?: number;

  @IsOptional()
  @IsInt()
  branch_subhead_id?: number;

  @IsOptional()
  @IsInt()
  frequency?: number;

  @IsNotEmpty()
  @IsString()
  last_audit_date!: string;

  @IsOptional()
  @IsInt()
  is_active?: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}

export class UpdateAuditUnitFrequencyDto {
  @IsInt()
  @IsIn([1, 3, 6, 12])
  @IsNotEmpty()
  frequency!: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}

export class CreateTargetDto {
  @IsInt()
  year_id!: number;

  @IsInt()
  audit_unit_id!: number;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  deposit_target!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  advances_target!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  npa_target!: string;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}
export class UpdateTargetDto {
  @IsOptional()
  @IsInt()
  year_id?: number;

  @IsOptional()
  @IsString()
  deposit_target?: string;

  @IsOptional()
  @IsString()
  advances_target?: string;

  @IsOptional()
  @IsString()
  npa_target?: string;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}
