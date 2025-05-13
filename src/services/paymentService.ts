// src/services/paymentService.ts
import { PaymentMethod } from '../entities/PaymentMethod';

export interface PaymentResult {
  status: 'success' | 'failed';
  transaction_id?: string;
  error?: string;
}

export async function processPayment(paymentMethod: PaymentMethod, amount: number): Promise<PaymentResult> {
  const result = mockPaymentGateway(paymentMethod.token, amount);
  return result;
}

function mockPaymentGateway(_token: string, _amount: number): PaymentResult {
  // Simulate payment processing (70% success rate)
  if (Math.random() < 0.7) {
    return { status: 'success', transaction_id: Math.floor(1000 + Math.random() * 9000).toString() };
  }
  return { status: 'failed', error: 'insufficient_funds' };
}
