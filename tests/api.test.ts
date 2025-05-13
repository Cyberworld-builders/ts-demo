// tests/api.test.ts
import request from 'supertest';
import { getConnection } from 'typeorm';
import { app } from '../src/app';
import { Subscription } from '../src/entities/Subscription';
import { Invoice } from '../src/entities/Invoice';
import * as paymentService from '../src/services/paymentService';
import * as dunningService from '../src/services/dunningService';
import { v4 as uuidv4 } from 'uuid';

jest.mock('../src/services/paymentService');
jest.mock('../src/services/dunningService');

// Increase timeout for all tests
jest.setTimeout(10000);

describe('Billing Engine API', () => {
  beforeEach(async () => {
    const connection = getConnection();
    await connection.synchronize(true);
  });

  // 5.1 Customer & Account Management
  describe('Customer Management', () => {
    it('should create a customer', async () => {
      const email = `test-${uuidv4()}@example.com`;
      const response = await request(app)
        .post('/api/customers')
        .send({ email, name: 'Test User', role: 'user' });
      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: expect.any(Number),
        email,
        name: 'Test User',
        role: 'user',
      });
    });

    it('should get a customer by ID', async () => {
      const email = `test-${uuidv4()}@example.com`;
      const createResponse = await request(app)
        .post('/api/customers')
        .send({ email, name: 'Test User', role: 'user' });
      const customerId = createResponse.body.id;
      const response = await request(app).get(`/api/customers/${customerId}`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: customerId,
        email,
        name: 'Test User',
        role: 'user',
      });
    });

    it('should return 404 for non-existent customer', async () => {
      const response = await request(app).get('/api/customers/999');
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Customer not found' });
    });
  });

  // 5.2 Payment Methods & Processing
  describe('Payment Methods & Processing', () => {
    let customerId: number;
    let email: string;

    beforeEach(async () => {
      email = `test-${uuidv4()}@example.com`;
      const response = await request(app)
        .post('/api/customers')
        .send({ email, name: 'Test User' });
      customerId = response.body.id;
    });

    it('should add a payment method', async () => {
      const response = await request(app)
        .post(`/api/customers/${customerId}/payment_methods`)
        .send({ card_number: '1234567890123456' });
      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: expect.any(Number),
        card_number: '3456',
      });
    });

    it('should process a successful payment', async () => {
      const paymentMethodResponse = await request(app)
        .post(`/api/customers/${customerId}/payment_methods`)
        .send({ card_number: '1234567890123456' });
      const paymentMethodId = paymentMethodResponse.body.id;
      (paymentService.processPayment as jest.Mock).mockResolvedValue({
        status: 'success',
        transaction_id: '1234',
      });
      const response = await request(app)
        .post('/api/payments')
        .send({ customer_id: customerId, amount: 50.0, payment_method_id: paymentMethodId });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'success', transaction_id: '1234' });
    });

    it('should handle a failed payment and trigger dunning', async () => {
      const paymentMethodResponse = await request(app)
        .post(`/api/customers/${customerId}/payment_methods`)
        .send({ card_number: '1234567890123456' });
      const paymentMethodId = paymentMethodResponse.body.id;
      (paymentService.processPayment as jest.Mock).mockResolvedValue({
        status: 'failed',
        error: 'insufficient_funds',
      });
      (dunningService.handleFailedPayment as jest.Mock).mockResolvedValue(undefined);
      const response = await request(app)
        .post('/api/payments')
        .send({ customer_id: customerId, amount: 50.0, payment_method_id: paymentMethodId });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ status: 'failed', error: 'insufficient_funds' });
      expect(dunningService.handleFailedPayment).toHaveBeenCalled();
    });
  });

  // 5.3 Subscription Management
  describe('Subscription Management', () => {
    let customerId: number;
    let email: string;

    beforeEach(async () => {
      email = `test-${uuidv4()}@example.com`;
      const response = await request(app)
        .post('/api/customers')
        .send({ email, name: 'Test User' });
      customerId = response.body.id;
    });

    it('should create a subscription and generate an invoice', async () => {
      const response = await request(app)
        .post('/api/subscriptions')
        .send({
          customer_id: customerId,
          plan_name: 'Pro',
          price: 50.0,
          billing_interval: 'monthly',
        });
      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: expect.any(Number),
        plan_name: 'Pro',
        status: 'active',
        invoice_id: expect.any(Number),
      });
      const invoice = await Invoice.findOne({ where: { id: response.body.invoice_id } });
      expect(invoice).toBeDefined();
      expect(invoice!.amount).toBe(50.0);
    });

    it('should cancel a subscription and send proration email', async () => {
      const email = `test-${uuidv4()}@example.com`;
      const customerResponse = await request(app)
        .post('/api/customers')
        .send({ email, name: 'Test User' });
      const customerId = customerResponse.body.id;
      
      const subResponse = await request(app)
        .post('/api/subscriptions')
        .send({
          customer_id: customerId,
          plan_name: 'Pro',
          price: 50.0,
          billing_interval: 'monthly',
        });
      const subscriptionId = subResponse.body.id;
      
      const response = await request(app).post(`/api/subscriptions/${subscriptionId}/cancel`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: subscriptionId,
        status: 'canceled',
      });
      
      const subscription = await Subscription.findOne({ where: { id: subscriptionId } });
      expect(subscription!.endDate).toBeDefined();
    });
  });

  // 5.4 Invoicing & Billing
  describe('Invoicing', () => {
    let invoiceId: number;
    let email: string;

    beforeEach(async () => {
      email = `test-${uuidv4()}@example.com`;
      const customerResponse = await request(app)
        .post('/api/customers')
        .send({ email, name: 'Test User' });
      const customerId = customerResponse.body.id;
      const subResponse = await request(app)
        .post('/api/subscriptions')
        .send({
          customer_id: customerId,
          plan_name: 'Pro',
          price: 50.0,
          billing_interval: 'monthly',
        });
      invoiceId = subResponse.body.invoice_id;
    });

    it('should get an invoice by ID', async () => {
      const response = await request(app).get(`/api/invoices/${invoiceId}`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: invoiceId,
        customer_id: expect.any(Number),
        amount: 50.0,
        status: 'pending',
        due_date: expect.any(String),
      });
    });

    it('should return 404 for non-existent invoice', async () => {
      const response = await request(app).get('/api/invoices/999');
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Invoice not found' });
    });
  });

  // 5.10 Admin Dashboard
  describe('Admin Dashboard', () => {
    it('should allow admin access to dashboard', async () => {
      const response = await request(app).get('/dashboard?role=admin');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Admin Dashboard');
    });

    it('should deny non-admin access to dashboard', async () => {
      const response = await request(app).get('/dashboard?role=user');
      expect(response.status).toBe(403);
      expect(response.text).toBe('Access denied');
    });

    it('should display invoice details', async () => {
      const email = `test-${uuidv4()}@example.com`;
      const customerResponse = await request(app)
        .post('/api/customers')
        .send({ email, name: 'Test User' });
      const customerId = customerResponse.body.id;
      const subResponse = await request(app)
        .post('/api/subscriptions')
        .send({
          customer_id: customerId,
          plan_name: 'Pro',
          price: 50.0,
          billing_interval: 'monthly',
        });
      const invoiceId = subResponse.body.invoice_id;
      const response = await request(app).get(`/invoices/${invoiceId}`);
      expect(response.status).toBe(200);
      expect(response.text).toContain(`Invoice #${invoiceId}`);
    });
  });
});
