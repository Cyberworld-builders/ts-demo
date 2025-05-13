// src/entities/PaymentMethod.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, BaseEntity } from 'typeorm';
import { Customer } from './Customer';

@Entity()
export class PaymentMethod extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Customer, (customer) => customer.paymentMethods)
  customer!: Customer;

  @Column()
  cardNumber!: string; // Last 4 digits

  @Column()
  token!: string; // Mock tokenized card
}
