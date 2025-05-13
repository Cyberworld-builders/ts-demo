// src/entities/Invoice.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, BaseEntity } from 'typeorm';
import { Customer } from './Customer';
import { Subscription } from './Subscription';

@Entity()
export class Invoice extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Customer, (customer) => customer.invoices)
  customer!: Customer;

  @ManyToOne(() => Subscription, (subscription) => subscription.invoices)
  subscription!: Subscription;

  @Column('float')
  amount!: number;

  @Column({ default: 'pending' })
  status: string = 'pending';

  @Column()
  dueDate!: Date;
}
