import { IsNotEmpty, IsString } from 'class-validator';

export class CreateAuditSectionDto {
  @IsNotEmpty()
  @IsString()
  name: string;
}
