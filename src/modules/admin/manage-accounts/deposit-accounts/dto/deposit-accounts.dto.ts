import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';

export class CreateDepositAccountDto {
  @IsInt()
  branch_id!: number;

  @IsInt()
  scheme_id!: number;

  @IsNotEmpty()
  @IsString()
  account_no!: string;

  @IsNotEmpty()
  @IsString()
  account_holder_name!: string;

  @IsNotEmpty()
  @IsString()
  ucic!: string;

  @IsNotEmpty()
  @IsString()
  customer_type!: string;

  @IsNotEmpty()
  @IsString()
  intrest_rate!: string;

  @IsNotEmpty()
  @IsString()
  principal_amount!: string;

  @IsOptional()
  @IsDateString()
  account_opening_date?: string;

  @IsNotEmpty()
  @IsString()
  balance!: string;

  @IsOptional()
  @IsDateString()
  balance_date?: string;

  @IsOptional()
  @IsDateString()
  maturity_date?: string;

  @IsNotEmpty()
  @IsString()
  maturity_amount!: string;

  @IsOptional()
  @IsDateString()
  close_date?: string;

  @IsNotEmpty()
  @IsString()
  account_status!: string;

  @IsOptional()
  @IsInt()
  sampling_filter?: number;

  @IsInt()
  assesment_period_id!: number;

  @IsOptional()
  @IsInt()
  admin_id?: number;
}

export class UpdateDepositAccountDto extends PartialType(
  CreateDepositAccountDto,
) {}

export class DepositAccountFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  search_type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branch_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  scheme_id?: number;

  @IsOptional()
  @IsString()
  period_from?: string;

  @IsOptional()
  @IsString()
  period_to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}

export class UploadDepositCsvDto {
  @IsNotEmpty()
  file: any;
}
