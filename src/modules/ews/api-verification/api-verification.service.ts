import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiVerificationService {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService
      .get<string>('SUREPASS_API_URL', 'https://kyc-api.surepass.app')
      .replace(/\/$/, ''); // strip trailing slash
    this.token = this.configService.get<string>('SUREPASS_API_TOKEN', '');
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    // strip leading slash from endpoint so we always get exactly one slash
    const url = `${this.baseUrl}/${endpoint.replace(/^\//, '')}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    };

    // BUG-FIX: do NOT include Content-Type for GET requests (some servers reject it)
    if (options.method === 'GET') {
      delete headers['Content-Type'];
    }

    try {
      const response = await fetch(url, { ...options, headers });

      // BUG-FIX: always read body, even on error, so we can pass the message through
      let data: any;
      try {
        data = await response.json();
      } catch {
        throw new HttpException(
          `Surepass returned non-JSON response (status ${response.status})`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      // BUG-FIX: treat any non-success response as an error; preserve message_code too
      if (!response.ok || !data?.success) {
        throw new HttpException(
          {
            message: data?.message || 'Surepass API returned an error',
            message_code: data?.message_code,
            status_code: data?.status_code,
          },
          response.ok ? HttpStatus.UNPROCESSABLE_ENTITY : response.status,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error instanceof Error
          ? error.message
          : 'Internal Server Error while calling Surepass API',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // 1. UDYAM Verification
  async udyamVerification(id_number: string) {
    return this.request('api/v1/corporate/udyog-aadhaar', {
      method: 'POST',
      body: JSON.stringify({ id_number }),
    });
  }

  // 2. GST Verification
  async gstVerification(id_number: string) {
    return this.request('api/v1/corporate/gstin-advanced', {
      method: 'POST',
      body: JSON.stringify({ id_number }),
    });
  }

  // 3. Company CIN by Name
  async getCinByName(company_name_search: string) {
    return this.request('api/v1/corporate/name-to-cin-list', {
      method: 'POST',
      body: JSON.stringify({ company_name_search }),
    });
  }

  // 4. CIN to Company Details
  async getCompanyDetails(id_number: string) {
    return this.request('api/v1/corporate/company-details', {
      method: 'POST',
      body: JSON.stringify({ id_number }),
    });
  }

  // 5. DIN Details
  async getDinDetails(id_number: string) {
    return this.request('api/v1/corporate/din', {
      method: 'POST',
      body: JSON.stringify({ id_number }),
    });
  }

  // 6. DIN to Phone
  async getDinToPhone(id_number: string) {
    return this.request('api/v1/corporate/director-phone', {
      method: 'POST',
      body: JSON.stringify({ id_number }),
    });
  }

  // 7. PAN to CIN
  async getPanToCin(pan_number: string) {
    return this.request('api/v1/corporate/pan-to-cin', {
      method: 'POST',
      body: JSON.stringify({ pan_number }),
    });
  }

  // 8. PAN to GSTIN
  async getPanToGstin(id_number: string) {
    return this.request('api/v1/corporate/gstin-by-pan', {
      method: 'POST',
      body: JSON.stringify({ id_number }),
    });
  }

  // 9. RERA State List
  async getReraStateList() {
    return this.request('api/v1/rera/state-list', { method: 'GET' });
  }

  // 10. RERA Details
  async getReraDetails(
    registration_number: string,
    registration_type: string,
    state_name: string,
  ) {
    return this.request('api/v1/rera/rera-v2', {
      method: 'POST',
      body: JSON.stringify({ registration_number, registration_type, state_name }),
    });
  }

  // 11. Karnataka Land Records
  async getKarnatakaLandRecords(payload: any) {
    return this.request('api/v1/land-verification/karnataka', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // 12. Gujarat Land Records
  async getGujaratLandRecords(payload: any) {
    return this.request('api/v1/land-verification/gujarat', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}
