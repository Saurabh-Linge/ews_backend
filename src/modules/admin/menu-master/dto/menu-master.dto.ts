import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateMenuMasterDto {
  @IsNotEmpty()
  @IsNumber()
  section_type_id!: number;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNotEmpty()
  @IsNumber()
  linked_table_id!: number;

  @IsNotEmpty()
  @IsNumber()
  is_active!: number;
}
