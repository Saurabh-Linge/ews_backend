import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateQuestionSetDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-zA-Z0-9 ]+$/)
  name!: string;

  @IsInt()
  @IsIn([1, 2])
  set_type_id!: number;

  @IsOptional()
  @IsInt()
  is_active?: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}

export class UpdateQuestionSetDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9 ]+$/)
  name?: string;

  @IsOptional()
  @IsInt()
  @IsIn([1, 2])
  set_type_id?: number;

  @IsOptional()
  @IsInt()
  is_active?: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}

export class CreateQuestionHeaderDto {
  @IsInt()
  question_set_id!: number;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-zA-Z0-9 ]+$/)
  name!: string;

  @IsOptional()
  @IsInt()
  is_active?: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}

export class UpdateQuestionHeaderDto {
  @IsOptional()
  @IsInt()
  question_set_id?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9 ]+$/)
  name?: string;

  @IsOptional()
  @IsInt()
  is_active?: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}

export class CreateQuestionDto {
  @IsInt()
  set_id!: number;

  @IsInt()
  header_id!: number;

  @IsNotEmpty()
  @IsString()
  question!: string;

  @IsInt()
  question_type_id!: number;

  @IsInt()
  option_id!: number;

  @IsInt()
  applicable_id!: number;

  @IsOptional()
  @IsInt()
  annexure_id?: number;

  @IsOptional()
  @IsString()
  subset_multi_id?: string;

  // Business Risk Category
  @IsInt()
  risk_category_id!: number;

  @IsInt()
  area_of_audit_id!: number;

  @IsInt()
  control_risk_id!: number;

  @IsInt()
  key_aspect_id!: number;

  @IsInt()
  residual_risk_id!: number;

  @IsOptional()
  @IsInt()
  show_instances?: number;

  @IsOptional()
  @IsInt()
  audit_ev_upload?: number;

  @IsOptional()
  @IsInt()
  compliance_ev_upload?: number;

  @IsOptional()
  @IsInt()
  is_active?: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsInt()
  set_id?: number;

  @IsOptional()
  @IsInt()
  header_id?: number;

  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsInt()
  annexure_id?: number;

  @IsOptional()
  @IsString()
  subset_multi_id?: string;

  @IsOptional()
  @IsInt()
  question_type_id?: number;

  @IsOptional()
  @IsInt()
  option_id?: number;

  @IsOptional()
  @IsInt()
  applicable_id?: number;

  @IsOptional()
  @IsInt()
  risk_category_id?: number;

  @IsOptional()
  @IsInt()
  area_of_audit_id?: number;

  @IsOptional()
  @IsInt()
  control_risk_id?: number;

  @IsOptional()
  @IsInt()
  key_aspect_id?: number;

  @IsOptional()
  @IsInt()
  residual_risk_id?: number;

  @IsOptional()
  @IsInt()
  show_instances?: number;

  @IsOptional()
  @IsInt()
  audit_ev_upload?: number;

  @IsOptional()
  @IsInt()
  compliance_ev_upload?: number;

  @IsOptional()
  @IsInt()
  is_active?: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}

export class CreateQuestionRiskMappingDto {
  @IsInt()
  question_id!: number;

  @IsNotEmpty()
  @IsString()
  risk_type!: string;

  @IsNotEmpty()
  @IsString()
  business_risk!: string;

  @IsNotEmpty()
  @IsString()
  control_risk!: string;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}
