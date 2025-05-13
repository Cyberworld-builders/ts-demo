// src/entities/Subscription.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, BaseEntity } from 'typeorm';
import { Customer } from './Customer';
import { Invoice } from './Invoice';

@Entity()
export class Subscription extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Customer, (customer) => customer.subscriptions)
  customer!: Customer;

  @Column()
  planName!: string;

  @Column('float')
  price!: number;

  @Column()
  billingInterval!: string; // 'monthly' or 'yearly'

  @Column()
  startDate!: Date;

  @Column({ nullable: true })
  endDate?: Date;

  @Column({ default: 'active' })
  status: string = 'active';

  @OneToMany(() => Invoice, (invoice) => invoice.subscription)
  invoices: Invoice[] = [];
}
