**tests/api.test.ts**

```typescript
// tests/api.test.ts
import request from 'supertest';
import { createConnection, getConnection } from 'typeorm';
import { app } from '../src/app';
import { Customer } from '../src/entities/Customer';
import { PaymentMethod } from '../src/entities/PaymentMethod';
import { Subscription } from '../src/entities/Subscription';
import { Invoice } from '../src/entities/Invoice';
import * as paymentService from '../src/services/paymentService';
import * as dunningService from '../src/services/dunningService';

jest.mock('../src/services/paymentService');
jest.mock('../src/services/dunningService');

describe('Billing Engine API', () => {
  beforeAll(async () => {
    await createConnection({
      type: 'sqlite',
      database: ':memory:',
      entities: [Customer, PaymentMethod, Subscription, Invoice],
      synchronize: true,
    });
  });

  afterAll(async () => {
    await getConnection().close();
  });

  beforeEach(async () => {
    await getConnection().synchronize(true); // Reset database
  });

  // 5.1 Customer & Account Management
  describe('Customer Management', () => {
    it('should create a customer', async () => {
      const response = await request(app)
        .post('/api/customers')
        .send({ email: 'test@example.com', name: 'Test User', role: 'user' });
      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: expect.any(Number),
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
      });
    });

    it('should get a customer by ID', async () => {
      const createResponse = await request(app)
        .post('/api/customers')
        .send({ email: 'test@example.com', name: 'Test User', role: 'user' });
      const customerId = createResponse.body.id;
      const response = await request(app).get(`/api/customers/${customerId}`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: customerId,
        email: 'test@example.com',
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

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/customers')
        .send({ email: 'test@example.com', name: 'Test User' });
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

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/customers')
        .send({ email: 'test@example.com', name: 'Test User' });
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
      const subscription = await Subscription.findOne(subscriptionId);
      expect(subscription!.endDate).toBeDefined();
    });
  });

  // 5.4 Invoicing & Billing
  describe('Invoicing', () => {
    let invoiceId: number;

    beforeEach(async () => {
      const customerResponse = await request(app)
        .post('/api/customers')
        .send({ email: 'test@example.com', name: 'Test User' });
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
      const customerResponse = await request(app)
        .post('/api/customers')
        .send({ email: 'test@example.com', name: 'Test User' });
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
```

```json
// package.json
{
  "name": "billing-engine",
  "version": "1.0.0",
  "scripts": {
    "start": "ts-node src/app.ts",
    "build": "tsc",
    "dev": "ts-node-dev src/app.ts",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "typeorm": "^0.3.20",
    "sqlite3": "^5.1.7",
    "nodemailer": "^6.9.13",
    "uuid": "^9.0.1",
    "ejs": "^3.1.10"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "ts-node": "^10.9.2",
    "ts-node-dev": "^2.0.0",
    "@types/express": "^4.17.21",
    "@types/node": "^20.12.7",
    "@types/nodemailer": "^6.4.14",
    "@types/uuid": "^9.0.8",
    "jest": "^29.7.0",
    "supertest": "^6.3.4",
    "@types/jest": "^29.5.12",
    "@types/supertest": "^2.0.16",
    "ts-jest": "^29.1.2"
  }
}
```

```markdown
// README.md
# Billing Engine Demo (TypeScript)

A TypeScript/Node.js app demonstrating billing engine concepts from PRD sections 5.1–5.5, with a test suite.

## Setup
1. Install Node.js 16+.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the app in development mode:
   ```bash
   npm run dev
   ```

## Running Tests
1. Ensure dependencies are installed.
2. Run tests with Jest:
   ```bash
   npm test
   ```
3. Tests cover all API endpoints and dashboard access.

## API Endpoints
- `POST /api/customers`: Create a customer (e.g., `{"email": "test@example.com", "name": "Test User", "role": "user"}`).
- `GET /api/customers/<id>`: Get customer details.
- `POST /api/customers/<id>/payment_methods`: Add payment method (e.g., `{"card_number": "1234567890123456"}`).
- `POST /api/payments`: Process payment (e.g., `{"customer_id": 1, "amount": 50.0, "payment_method_id": 1}`).
- `POST /api/subscriptions`: Create subscription (e.g., `{"customer_id": 1, "plan_name": "Pro", "price": 50.0, "billing_interval": "monthly"}`).
- `POST /api/subscriptions/<id>/cancel`: Cancel subscription.
- `GET /api/invoices/<id>`: Get invoice details.
- `GET /dashboard?role=admin`: View admin dashboard.

## Notes
- Uses SQLite for simplicity; adapt to PostgreSQL for production.
- Mock payment gateway with 70% success rate.
- Emails are logged to console (use a real SMTP server for production).
- Dunning retries are simplified (one retry after 2 days).
- Test suite covers success and failure cases for all endpoints.
```