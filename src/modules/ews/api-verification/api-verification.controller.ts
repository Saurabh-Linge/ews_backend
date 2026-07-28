import { Controller, Post, Get, Body } from '@nestjs/common';
import { ApiVerificationService } from './api-verification.service';

@Controller('ews/api-verification')
export class ApiVerificationController {
  constructor(private readonly apiVerificationService: ApiVerificationService) {}

  @Post('udyog-aadhaar')
  async udyamVerification(@Body('id_number') idNumber: string) {
    return this.apiVerificationService.udyamVerification(idNumber);
  }

  @Post('gstin-advanced')
  async gstVerification(@Body('id_number') idNumber: string) {
    return this.apiVerificationService.gstVerification(idNumber);
  }

  @Post('name-to-cin-list')
  async getCinByName(@Body('company_name_search') companyNameSearch: string) {
    return this.apiVerificationService.getCinByName(companyNameSearch);
  }

  @Post('company-details')
  async getCompanyDetails(@Body('id_number') idNumber: string) {
    return this.apiVerificationService.getCompanyDetails(idNumber);
  }

  @Post('din')
  async getDinDetails(@Body('id_number') idNumber: string) {
    return this.apiVerificationService.getDinDetails(idNumber);
  }

  @Post('director-phone')
  async getDinToPhone(@Body('id_number') idNumber: string) {
    return this.apiVerificationService.getDinToPhone(idNumber);
  }

  @Post('pan-to-cin')
  async getPanToCin(@Body('pan_number') panNumber: string) {
    return this.apiVerificationService.getPanToCin(panNumber);
  }

  @Post('gstin-by-pan')
  async getPanToGstin(@Body('id_number') idNumber: string) {
    return this.apiVerificationService.getPanToGstin(idNumber);
  }

  @Get('rera/state-list')
  async getReraStateList() {
    return this.apiVerificationService.getReraStateList();
  }

  @Post('rera/rera-v2')
  async getReraDetails(
    @Body('registration_number') registrationNumber: string,
    @Body('registration_type') registrationType: string,
    @Body('state_name') stateName: string,
  ) {
    return this.apiVerificationService.getReraDetails(registrationNumber, registrationType, stateName);
  }

  @Post('land-verification/karnataka')
  async getKarnatakaLandRecords(@Body() payload: any) {
    return this.apiVerificationService.getKarnatakaLandRecords(payload);
  }

  @Post('land-verification/gujarat')
  async getGujaratLandRecords(@Body() payload: any) {
    return this.apiVerificationService.getGujaratLandRecords(payload);
  }
}
