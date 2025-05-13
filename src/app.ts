// src/app.ts
import express, { Request, Response } from 'express';
import { Customer } from './entities/Customer';
import { PaymentMethod } from './entities/PaymentMethod';
import { Subscription } from './entities/Subscription';
import { Invoice } from './entities/Invoice';
import { processPayment } from './services/paymentService';
import { handleFailedPayment } from './services/dunningService';
import { sendEmail } from './services/emailService';
import { v4 as uuidv4 } from 'uuid';
import { initializeDatabase } from './config/connection';

export const app = express();
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', './src/views');

// Initialize database
initializeDatabase().then(() => console.warn('Database connected'));

// 5.1 Customer & Account Management
app.post('/api/customers', async (req: Request, res: Response): Promise<void> => {
  const { email, name, role } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }
  const customer = new Customer();
  customer.email = email;
  customer.name = name || '';
  customer.role = role || 'user';
  await customer.save();
  res.status(201).json({ 
    id: customer.id, 
    email: customer.email, 
    name: customer.name,
    role: customer.role 
  });
});

app.get('/api/customers/:id', async (req: Request, res: Response): Promise<void> => {
  const customer = await Customer.findOne({ where: { id: parseInt(req.params.id) } });
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }
  res.json({ id: customer.id, email: customer.email, name: customer.name, role: customer.role });
});

// 5.2 Payment Methods & Processing
app.post('/api/customers/:customerId/payment_methods', async (req: Request, res: Response): Promise<void> => {
  const customer = await Customer.findOne({ where: { id: parseInt(req.params.customerId) } });
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }
  const { card_number } = req.body;
  if (!card_number) {
    res.status(400).json({ error: 'Card number required' });
    return;
  }
  const paymentMethod = new PaymentMethod();
  paymentMethod.customer = customer;
  paymentMethod.cardNumber = card_number.slice(-4);
  paymentMethod.token = uuidv4();
  await paymentMethod.save();
  res.status(201).json({ id: paymentMethod.id, card_number: paymentMethod.cardNumber });
});

app.post('/api/payments', async (req: Request, res: Response): Promise<void> => {
  const { amount, payment_method_id } = req.body;
  const paymentMethod = await PaymentMethod.findOne({ 
    where: { id: payment_method_id },
    relations: ['customer']
  });
  if (!paymentMethod) {
    res.status(404).json({ error: 'Payment method not found' });
    return;
  }
  const result = await processPayment(paymentMethod, amount);
  if (result.status === 'success') {
    res.json(result);
    return;
  }
  await handleFailedPayment(paymentMethod.customer, paymentMethod, amount);
  res.status(400).json(result);
});

// 5.3 Subscription Management
app.post('/api/subscriptions', async (req: Request, res: Response): Promise<void> => {
  const { customer_id, plan_name, price, billing_interval } = req.body;
  const customer = await Customer.findOne({ where: { id: customer_id } });
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }
  const subscription = new Subscription();
  subscription.customer = customer;
  subscription.planName = plan_name;
  subscription.price = price;
  subscription.billingInterval = billing_interval;
  subscription.startDate = new Date();
  subscription.status = 'active';
  await subscription.save();
  const invoice = await generateInvoice(customer, subscription, price);
  res.status(201).json({
    id: subscription.id,
    plan_name: subscription.planName,
    status: subscription.status,
    invoice_id: invoice.id,
  });
});

app.post('/api/subscriptions/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  const subscription = await Subscription.findOne({ 
    where: { id: parseInt(req.params.id) },
    relations: ['customer']
  });
  if (!subscription) {
    res.status(404).json({ error: 'Subscription not found' });
    return;
  }
  subscription.status = 'canceled';
  subscription.endDate = new Date();
  await subscription.save();
  // Simplified proration
  const daysRemaining = 30 - Math.floor((Date.now() - subscription.startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysRemaining > 0) {
    const proratedAmount = (daysRemaining / 30) * subscription.price;
    await sendEmail(
      subscription.customer.email,
      'Subscription Canceled',
      `Your subscription has been canceled. Prorated refund: $${proratedAmount.toFixed(2)}`,
    );
  }
  res.json({ id: subscription.id, status: subscription.status });
});

// 5.4 Invoicing & Billing
async function generateInvoice(customer: Customer, subscription: Subscription, amount: number): Promise<Invoice> {
  const invoice = new Invoice();
  invoice.customer = customer;
  invoice.subscription = subscription;
  invoice.amount = amount;
  invoice.status = 'pending';
  invoice.dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
  await invoice.save();
  await sendEmail(
    customer.email,
    `Invoice #${invoice.id}`,
    `New invoice for ${subscription.planName}. Amount: $${amount.toFixed(2)}, Due: ${invoice.dueDate.toISOString()}`,
  );
  return invoice;
}

app.get('/api/invoices/:id', async (req: Request, res: Response): Promise<void> => {
  const invoice = await Invoice.findOne({ 
    where: { id: parseInt(req.params.id) },
    relations: ['customer', 'subscription']
  });
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  res.json({
    id: invoice.id,
    customer_id: invoice.customer.id,
    amount: invoice.amount,
    status: invoice.status,
    due_date: invoice.dueDate,
  });
});

// 5.10 Admin Dashboard
app.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  const role = req.query.role as string;
  if (role !== 'admin') {
    res.status(403).send('Access denied');
    return;
  }
  const customers = await Customer.find();
  const invoices = await Invoice.find({ relations: ['customer'] });
  res.render('dashboard', { customers, invoices });
});

app.get('/invoices/:id', async (req: Request, res: Response): Promise<void> => {
  const invoice = await Invoice.findOne({ 
    where: { id: parseInt(req.params.id) },
    relations: ['customer']
  });
  if (!invoice) {
    res.status(404).send('Invoice not found');
    return;
  }
  res.render('invoice', { invoice });
});

export const startServer = (): void => {
  app.listen(3000, () => console.warn('Server running on http://localhost:3000'));
};
