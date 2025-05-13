import { createConnection, getConnection } from 'typeorm';
import { Customer } from '../src/entities/Customer';
import { PaymentMethod } from '../src/entities/PaymentMethod';
import { Subscription } from '../src/entities/Subscription';
import { Invoice } from '../src/entities/Invoice';

// Setup before all tests
beforeAll(async () => {
  await createConnection({
    type: 'sqlite',
    database: ':memory:', // Use in-memory database for tests
    entities: [Customer, PaymentMethod, Subscription, Invoice],
    synchronize: true,
  });
});

// Cleanup after each test
afterEach(async () => {
  const connection = getConnection();
  await connection.synchronize(true); // This will clear all tables
});

// Cleanup after all tests
afterAll(async () => {
  const connection = getConnection();
  await connection.close();
});