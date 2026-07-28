import { IsOptional, IsNumber, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class ManageAssementMasterDto {
  @IsOptional()
  @IsNumber()
  audit_unit_id?: number;

  @IsOptional()
  @IsDateString()
  audit_due_date?: Date;

  @IsOptional()
  @IsDateString()
  compliance_due_date?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  compliance_review_reject_limit?: number;
  @IsOptional()
  @IsNumber()
  is_limit_blocked?: number;
}
