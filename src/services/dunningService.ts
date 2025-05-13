// src/services/dunningService.ts
import { Customer } from '../entities/Customer';
import { PaymentMethod } from '../entities/PaymentMethod';
import { sendEmail } from '../app';

export async function handleFailedPayment(customer: Customer, paymentMethod: PaymentMethod, amount: number): Promise<void> {
  // Simplified retry logic: schedule one retry after 2 days
  const retryDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  console.log(`Scheduled retry for ${customer.email} on ${retryDate.toISOString()}`);
  // Send dunning email
  await sendEmail(
    customer.email,
    'Payment Failed',
    `Payment of $${amount.toFixed(2)} failed. We'll retry on ${retryDate.toISOString()}. Please update your payment method.`,
  );
}
