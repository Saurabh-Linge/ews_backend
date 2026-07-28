import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
  @IsInt()
  menu_id!: number;

  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  question_set_ids?: string;

  @IsOptional()
  @IsInt()
  is_cc_acc_category?: number;

  @IsOptional()
  @IsInt()
  is_active?: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsInt()
  menu_id?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  question_set_ids?: string;

  @IsOptional()
  @IsInt()
  is_cc_acc_category?: number;

  @IsOptional()
  @IsInt()
  is_active?: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}

export class UpdateQuestionMappingDto {
  @IsOptional()
  @IsString()
  question_set_ids?: string;
}
