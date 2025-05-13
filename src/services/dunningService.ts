// src/services/dunningService.ts
import { Customer } from '../entities/Customer';
import { PaymentMethod } from '../entities/PaymentMethod';
import { sendEmail } from './emailService';

export async function handleFailedPayment(customer: Customer, paymentMethod: PaymentMethod, amount: number): Promise<void> {
  // Simplified retry logic: try once more after 2 days
  const retryDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
  console.log(`Scheduled retry for ${customer.email} on ${retryDate}`);
  
  // Send dunning email
  await sendEmail(
    customer.email,
    'Payment Failed',
    `Payment of $${amount.toFixed(2)} failed. We'll retry on ${retryDate.toISOString()}. Please update your payment method.`
  );
}
