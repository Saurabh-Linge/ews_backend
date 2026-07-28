import { Module } from '@nestjs/common';
import { PasswordPolicyController } from './password-policy.controller';
import { PasswordPolicyService } from './password-policy.service';
import { DatabaseModule } from '../../../core/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [PasswordPolicyController],
  providers: [PasswordPolicyService],
  exports: [PasswordPolicyService],
})
export class PasswordPolicyModule {}
