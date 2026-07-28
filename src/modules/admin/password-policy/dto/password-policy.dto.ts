import { IsNumber, Min } from 'class-validator';

export class UpdatePasswordPolicyDto {
  @IsNumber()
  @Min(1)
  min_length: number;

  @IsNumber()
  @Min(0)
  num_cnt: number;

  @IsNumber()
  @Min(0)
  uppercase_cnt: number;

  @IsNumber()
  @Min(0)
  lowercase_cnt: number;

  @IsNumber()
  @Min(0)
  symbol_cnt: number;
}
