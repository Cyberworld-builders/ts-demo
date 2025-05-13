# Billing Engine Demo (TypeScript)

A TypeScript/Node.js app demonstrating billing engine concepts.

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
4. Access the app at `http://localhost:3000`.

## API Endpoints
- `POST /api/customers`: Create a customer (e.g., `{"email": "test@example.com", "name": "Test User", "role": "user"}`).
- `GET /api/customers/<id>`: Get customer details.
- `POST /api/customers/<id>/payment_methods`: Add payment method (e.g., `{"card_number": "1234567890123456"}`).
- `POST /api/payments`: Process payment (e.g., `{"customer_id": 1, "amount": 50.0, "payment_method_id": 1}`).
- `POST /api/subscriptions`: Create subscription (e.g., `{"customer_id": 1, "plan_name": "Pro", "price": 50.0, "billing_interval": "monthly"}`).
- `POST /api/subscriptions/<id>/cancel`: Cancel subscription.
- `GET /api/invoices/<id>`: Get invoice details.
- `GET /dashboard?role=admin`: View admin dashboard.

## Curl Examples

**Create a customer:**
```bash
curl -X POST http://localhost:3000/api/customers \
     -H "Content-Type: application/json" \
     -d '{"email": "test@example.com", "name": "Test User", "role": "user"}'
```

**Get customer details:**
```bash
curl -X GET http://localhost:3000/api/customers/1
``` 

**Add payment method:**
```bash
curl -X POST http://localhost:3000/api/customers/1/payment_methods \
     -H "Content-Type: application/json" \
     -d '{"card_number": "1234567890123456"}'
```

**Process payment:**
```bash
curl -X POST http://localhost:3000/api/payments \
     -H "Content-Type: application/json" \
     -d '{"customer_id": 1, "amount": 50.0, "payment_method_id": 1}'
```

**Create subscription:**
```bash
curl -X POST http://localhost:3000/api/subscriptions \
     -H "Content-Type: application/json" \
     -d '{"customer_id": 1, "plan_name": "Pro", "price": 50.0, "billing_interval": "monthly"}'
```

**Cancel subscription:**
```bash
curl -X POST http://localhost:3000/api/subscriptions/1/cancel
```

**Get invoice details:**
```bash
curl -X GET http://localhost:3000/api/invoices/1
```

**View admin dashboard:**
```bash
curl http://localhost:3000/dashboard?role=admin
```

## Notes
- Uses SQLite for simplicity; adapt to PostgreSQL for production.
- Mock payment gateway with 70% success rate.
- Emails are logged to console (use a real SMTP server for production).
- Dunning retries are simplified (one retry after 2 days).
- Ready for Jest tests (to be added).


## Project Structure
```
billing-engine/
├── src/
│   ├── app.ts                   # Main Express app
│   ├── entities/               # TypeORM entities
│   │   ├── Customer.ts
│   │   ├── PaymentMethod.ts
│   │   ├── Subscription.ts
│   │   ├── Invoice.ts
│   ├── services/
│   │   ├── paymentService.ts   # Mock payment gateway
│   │   ├── dunningService.ts   # Dunning and retry logic
│   ├── views/
│   │   ├── dashboard.ejs       # Admin dashboard template
│   │   ├── invoice.ejs         # Invoice view template
├── package.json                # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── README.md                 # Setup instructions
```


**package.json**

```json
{
  "name": "billing-engine",
  "version": "1.0.0",
  "scripts": {
    "start": "ts-node src/app.ts",
    "build": "tsc",
    "dev": "ts-node-dev src/app.ts"
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
    "@types/uuid": "^9.0.8"
  }
}
```

**tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"]
}
```


**src/app.ts**

```typescript
// src/app.ts
import express, { Request, Response } from 'express';
import { createConnection } from 'typeorm';
import { Customer } from './entities/Customer';
import { PaymentMethod } from './entities/PaymentMethod';
import { Subscription } from './entities/Subscription';
import { Invoice } from './entities/Invoice';
import { processPayment } from './services/paymentService';
import { handleFailedPayment } from './services/dunningService';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', './src/views');

// Mock email transport (logs to console)
const transporter = nodemailer.createTransport({
  streamTransport: true,
  newline: 'unix',
  buffer: true,
});

// Initialize database
createConnection({
  type: 'sqlite',
  database: 'billing.db',
  entities: [Customer, PaymentMethod, Subscription, Invoice],
  synchronize: true, // Auto-create tables (dev only)
}).then(() => console.log('Database connected'));

// Helper to send emails
async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  try {
    const info = await transporter.sendMail({
      from: 'billing@example.com',
      to,
      subject,
      text: body,
    });
    console.log(`Email sent: ${info.message.toString()}`);
    return true;
  } catch (error) {
    console.error(`Email failed: ${error}`);
    return false;
  }
}

// 5.1 Customer & Account Management
app.post('/api/customers', async (req: Request, res: Response) => {
  const { email, name, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const customer = new Customer();
  customer.email = email;
  customer.name = name || '';
  customer.role = role || 'user';
  await customer.save();
  res.status(201).json({ id: customer.id, email: customer.email, role: customer.role });
});

app.get('/api/customers/:id', async (req: Request, res: Response) => {
  const customer = await Customer.findOne(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json({ id: customer.id, email: customer.email, name: customer.name, role: customer.role });
});

// 5.2 Payment Methods & Processing
app.post('/api/customers/:customerId/payment_methods', async (req: Request, res: Response) => {
  const customer = await Customer.findOne(req.params.customerId);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const { card_number } = req.body;
  if (!card_number) return res.status(400).json({ error: 'Card number required' });
  const paymentMethod = new PaymentMethod();
  paymentMethod.customer = customer;
  paymentMethod.cardNumber = card_number.slice(-4);
  paymentMethod.token = uuidv4();
  await paymentMethod.save();
  res.status(201).json({ id: paymentMethod.id, card_number: paymentMethod.cardNumber });
});

app.post('/api/payments', async (req: Request, res: Response) => {
  const { customer_id, amount, payment_method_id } = req.body;
  const paymentMethod = await PaymentMethod.findOne(payment_method_id, { relations: ['customer'] });
  if (!paymentMethod) return res.status(404).json({ error: 'Payment method not found' });
  const result = await processPayment(paymentMethod, amount);
  if (result.status === 'success') {
    return res.json(result);
  } else {
    await handleFailedPayment(paymentMethod.customer, paymentMethod, amount);
    return res.status(400).json(result);
  }
});

// 5.3 Subscription Management
app.post('/api/subscriptions', async (req: Request, res: Response) => {
  const { customer_id, plan_name, price, billing_interval } = req.body;
  const customer = await Customer.findOne(customer_id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
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

app.post('/api/subscriptions/:id/cancel', async (req: Request, res: Response) => {
  const subscription = await Subscription.findOne(req.params.id, { relations: ['customer'] });
  if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
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

app.get('/api/invoices/:id', async (req: Request, res: Response) => {
  const invoice = await Invoice.findOne(req.params.id, { relations: ['customer', 'subscription'] });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json({
    id: invoice.id,
    customer_id: invoice.customer.id,
    amount: invoice.amount,
    status: invoice.status,
    due_date: invoice.dueDate,
  });
});

// 5.10 Admin Dashboard
app.get('/dashboard', async (req: Request, res: Response) => {
  const role = req.query.role as string;
  if (role !== 'admin') return res.status(403).send('Access denied');
  const customers = await Customer.find();
  const invoices = await Invoice.find({ relations: ['customer'] });
  res.render('dashboard', { customers, invoices });
});

app.get('/invoices/:id', async (req: Request, res: Response) => {
  const invoice = await Invoice.findOne(req.params.id, { relations: ['customer'] });
  if (!invoice) return res.status(404).send('Invoice not found');
  res.render('invoice', { invoice });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
```

**src/entities/Customer.ts**

```typescript
// src/entities/Customer.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { PaymentMethod } from './PaymentMethod';
import { Subscription } from './Subscription';
import { Invoice } from './Invoice';

@Entity()
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ default: 'user' })
  role: string; // 'admin' or 'user'

  @OneToMany(() => PaymentMethod, (paymentMethod) => paymentMethod.customer)
  paymentMethods: PaymentMethod[];

  @OneToMany(() => Subscription, (subscription) => subscription.customer)
  subscriptions: Subscription[];

  @OneToMany(() => Invoice, (invoice) => invoice.customer)
  invoices: Invoice[];
}
```

**src/entities/PaymentMethod.ts**

```typescript
// src/entities/PaymentMethod.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Customer } from './Customer';

@Entity()
export class PaymentMethod {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Customer, (customer) => customer.paymentMethods)
  customer: Customer;

  @Column()
  cardNumber: string; // Last 4 digits

  @Column()
  token: string; // Mock tokenized card
}
```

```typescript
// src/entities/Subscription.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Customer } from './Customer';
import { Invoice } from './Invoice';

@Entity()
export class Subscription {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Customer, (customer) => customer.subscriptions)
  customer: Customer;

  @Column()
  planName: string;

  @Column('float')
  price: number;

  @Column()
  billingInterval: string; // 'monthly' or 'yearly'

  @Column()
  startDate: Date;

  @Column({ nullable: true })
  endDate: Date;

  @Column({ default: 'active' })
  status: string;

  @OneToMany(() => Invoice, (invoice) => invoice.subscription)
  invoices: Invoice[];
}
```

**src/entities/Invoice.ts**

```typescript
// src/entities/Invoice.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Customer } from './Customer';
import { Subscription } from './Subscription';

@Entity()
export class Invoice {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Customer, (customer) => customer.invoices)
  customer: Customer;

  @ManyToOne(() => Subscription, (subscription) => subscription.invoices)
  subscription: Subscription;

  @Column('float')
  amount: number;

  @Column({ default: 'pending' })
  status: string; // 'pending', 'paid', 'failed'

  @Column()
  dueDate: Date;
}
```

**src/services/paymentService.ts**

```typescript
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

function mockPaymentGateway(token: string, amount: number): PaymentResult {
  // Simulate payment processing (70% success rate)
  if (Math.random() < 0.7) {
    return { status: 'success', transaction_id: Math.floor(1000 + Math.random() * 9000).toString() };
  }
  return { status: 'failed', error: 'insufficient_funds' };
}
```

**src/services/dunningService.ts**

```typescript
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
```

**src/views/dashboard.ejs**

```ejs
<!-- src/views/dashboard.ejs -->
<!DOCTYPE html>
<html>
<head>
  <title>Admin Dashboard</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Admin Dashboard</h1>
  <h2>Customers</h2>
  <table>
    <tr><th>ID</th><th>Email</th><th>Name</th><th>Role</th></tr>
    <% customers.forEach(customer => { %>
      <tr>
        <td><%= customer.id %></td>
        <td><%= customer.email %></td>
        <td><%= customer.name %></td>
        <td><%= customer.role %></td>
      </tr>
    <% }) %>
  </table>
  <h2>Invoices</h2>
  <table>
    <tr><th>ID</th><th>Customer ID</th><th>Amount</th><th>Status</th><th>Due Date</th><th>View</th></tr>
    <% invoices.forEach(invoice => { %>
      <tr>
        <td><%= invoice.id %></td>
        <td><%= invoice.customer.id %></td>
        <td>$<%= invoice.amount.toFixed(2) %></td>
        <td><%= invoice.status %></td>
        <td><%= invoice.dueDate.toISOString().split('T')[0] %></td>
        <td><a href="/invoices/<%= invoice.id %>">View</a></td>
      </tr>
    <% }) %>
  </table>
</body>
</html>
```

**src/views/invoice.ejs**

```ejs
<!-- src/views/invoice.ejs -->
<!DOCTYPE html>
<html>
<head>
  <title>Invoice #<%= invoice.id %></title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .invoice { max-width: 600px; margin: auto; }
    .header { text-align: center; }
    .details { margin-top: 20px; }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <h1>Invoice #<%= invoice.id %></h1>
    </div>
    <div class="details">
      <p><strong>Customer ID:</strong> <%= invoice.customer.id %></p>
      <p><strong>Amount:</strong> $<%= invoice.amount.toFixed(2) %></p>
      <p><strong>Status:</strong> <%= invoice.status %></p>
      <p><strong>Due Date:</strong> <%= invoice.dueDate.toISOString().split('T')[0] %></p>
    </div>
  </div>
</body>
</html>
```

