import { ConnectionOptions } from 'typeorm';
import { Customer } from '../entities/Customer';
import { PaymentMethod } from '../entities/PaymentMethod';
import { Subscription } from '../entities/Subscription';
import { Invoice } from '../entities/Invoice';

const entities = [Customer, PaymentMethod, Subscription, Invoice];

export const developmentConfig: ConnectionOptions = {
  type: 'sqlite',
  database: 'billing.db',
  entities,
  synchronize: true,
};

export const testConfig: ConnectionOptions = {
  type: 'sqlite',
  database: ':memory:',
  entities,
  synchronize: true,
  dropSchema: true,
}; 