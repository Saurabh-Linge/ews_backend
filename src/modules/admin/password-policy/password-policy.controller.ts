import { Controller, Get, Post, Body } from '@nestjs/common';
import { PasswordPolicyService } from './password-policy.service';
import { UpdatePasswordPolicyDto } from './dto/password-policy.dto';

@Controller('password-policy')
export class PasswordPolicyController {
  constructor(private readonly passwordPolicyService: PasswordPolicyService) {}

  @Get()
  getPolicy() {
    return this.passwordPolicyService.getPolicy();
  }

  @Post()
  updatePolicy(@Body() dto: UpdatePasswordPolicyDto) {
    // Using hardcoded adminId 1 for now until full auth is linked
    return this.passwordPolicyService.updatePolicy(dto, 1);
  }
}
