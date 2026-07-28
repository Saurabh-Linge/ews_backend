import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiVerificationController } from './api-verification.controller';
import { ApiVerificationService } from './api-verification.service';

@Module({
  imports: [ConfigModule], // BUG-FIX: ConfigModule must be imported so ConfigService is available in this module
  controllers: [ApiVerificationController],
  providers: [ApiVerificationService],
  exports: [ApiVerificationService],
})
export class ApiVerificationModule {}
