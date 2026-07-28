import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './core/database/database.module';
import { IdModule } from './core/id/id.module';

// Core / Shared modules (reused from AuditPro)
import { EmployeesModule } from './modules/admin/employee-master/employees.module';
import { PasswordPolicyModule } from './modules/admin/password-policy/password-policy.module';
import { MenuMasterModule } from './modules/admin/menu-master/menu-master.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';

// EWS Modules
import { SignalsModule } from './modules/ews/signals/signals.module';
import { WatchListModule } from './modules/ews/watch-list/watch-list.module';
import { AuditTrailModule } from './modules/ews/audit-trail/audit-trail.module';
import { CbsRulesModule } from './modules/ews/cbs-rules/cbs-rules.module';
import { CbsUploadModule } from './modules/ews/cbs-upload/cbs-upload.module';
import { AuditTriggersModule } from './modules/ews/audit-triggers/audit-triggers.module';
import { RoAssessmentModule } from './modules/ews/ro-assessment/ro-assessment.module';
import { InvestigationsModule } from './modules/ews/investigations/investigations.module';
import { LoanQuestionsModule } from './modules/ews/masters/loan-questions/loan-questions.module';
import { EscalationsModule } from './modules/ews/escalations/escalations.module';
import { DisputesModule } from './modules/ews/disputes/disputes.module';
import { RiskConfigModule } from './modules/ews/risk-config/risk-config.module';
import { LoanTypeSignalConfigModule } from './modules/ews/loan-type-signal-config/loan-type-signal-config.module';
import { EwsReportsModule } from './modules/ews/ews-reports/ews-reports.module';
import { RolesModule } from './modules/ews/masters/roles/roles.module';
import { BranchesModule } from './modules/ews/masters/branches/branches.module';
import { UsersModule as EwsUsersModule } from './modules/ews/masters/users/users.module';
import { UploadModule } from './modules/ews/upload/upload.module';
import { AccountsModule } from './modules/ews/accounts/accounts.module';
import { ApiVerificationModule } from './modules/ews/api-verification/api-verification.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    IdModule,
    // Shared
    EmployeesModule,
    PasswordPolicyModule,
    MenuMasterModule,
    UsersModule,
    AuthModule,
    // EWS Core
    SignalsModule,
    WatchListModule,
    AuditTrailModule,
    CbsRulesModule,
    CbsUploadModule,
    AuditTriggersModule,
    RoAssessmentModule,
    InvestigationsModule,
    LoanQuestionsModule,
    EscalationsModule,
    DisputesModule,
    RiskConfigModule,
    LoanTypeSignalConfigModule,
    EwsReportsModule,
    RolesModule,
    BranchesModule,
    EwsUsersModule,
    UploadModule,
    AccountsModule,
    ApiVerificationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
