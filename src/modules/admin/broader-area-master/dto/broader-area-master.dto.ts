import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateBroaderAreaMasterDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  appetite_percent!: string;

  @IsString()
  @IsNotEmpty()
  occurance_percent!: string;

  @IsString()
  @IsNotEmpty()
  magnitude!: string;

  @IsString()
  @IsNotEmpty()
  frequency!: string;

  @IsString()
  @IsNotEmpty()
  average_qualitative_count!: string;

  @IsString()
  @IsNotEmpty()
  average_quantitative_count!: string;
}
