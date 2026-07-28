import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateAuditSchemeDto {
  @IsInt()
  @IsIn([1, 2])
  scheme_type_id!: number;

  @IsInt()
  category_id!: number;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-zA-Z0-9]+$/)
  scheme_code!: string;

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

export class UpdateSchemeDto {
  @IsOptional()
  @IsInt()
  @IsIn([1, 2])
  scheme_type_id?: number;

  @IsOptional()
  @IsInt()
  category_id?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9]+$/)
  scheme_code?: string;

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
