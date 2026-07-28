import {
  IsString,
  IsNumber,
  IsOptional,
  IsEmail,
  IsArray,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  emp_code: string;

  @IsNumber()
  user_type_id: number;

  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  mobile: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsString()
  gender: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsNumber()
  is_active?: number;

  @IsOptional()
  @IsString()
  audit_unit_authority?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  unit_ids?: number[];

  @IsOptional()
  @IsNumber()
  admin_id?: number;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  emp_code?: string;

  @IsOptional()
  @IsNumber()
  user_type_id?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsNumber()
  is_active?: number;

  @IsOptional()
  @IsString()
  audit_unit_authority?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  unit_ids?: number[];

  @IsOptional()
  @IsNumber()
  admin_id?: number;
}

export class SetPasswordDto {
  @IsString()
  password: string;
}

export class UpdateAuthorityDto {
  @IsArray()
  @IsNumber({}, { each: true })
  unit_ids: number[];
}
