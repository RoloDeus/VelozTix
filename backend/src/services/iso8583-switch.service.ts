import { Iso8583AuthorizationTraceDto } from '../types/openapi.js';

export interface IIsoSwitchGateway {
  requestAuthorization(params: {
    merchantId: string;
    amountBs: number;
    orderId: string;
  }): Promise<Iso8583AuthorizationTraceDto>;
}

export class Iso8583SwitchSimulator implements IIsoSwitchGateway {
  private stanCounter = 482910;

  async requestAuthorization(params: {
    merchantId: string;
    amountBs: number;
    orderId: string;
  }): Promise<Iso8583AuthorizationTraceDto> {
    this.stanCounter = (this.stanCounter + 1) % 1000000;
    const stan = this.stanCounter.toString().padStart(6, '0');

    // Amount in cents padded to 12 digits
    const cents = Math.round(params.amountBs * 100);
    const de4Amount = cents.toString().padStart(12, '0');

    // RRN: 12 digits (date prefix + stan)
    const today = new Date();
    const julian = `${today.getFullYear().toString().slice(-1)}${today.getMonth() + 1}${today.getDate().toString().padStart(2, '0')}`;
    const rrn = `${julian}${stan}`.padEnd(12, '0').slice(0, 12);

    // Auth Code: 6 chars alphanumeric
    const authCode = `A${Math.floor(10000 + Math.random() * 89999)}`;

    return {
      mti_request: '0100',
      mti_response: '0110',
      de3_processing_code: '000000',
      de4_transaction_amount: de4Amount,
      de11_stan: stan,
      de37_rrn: rrn,
      de38_auth_code: authCode,
      de39_response_code: '00',
      de42_merchant_id: params.merchantId,
    };
  }
}

