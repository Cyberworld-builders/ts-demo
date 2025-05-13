// src/entities/Customer.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, BaseEntity } from 'typeorm';
import { PaymentMethod } from './PaymentMethod';
import { Subscription } from './Subscription';
import { Invoice } from './Invoice';

@Entity()
export class Customer extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  email!: string;

  @Column({ nullable: true })
  name: string = '';

  @Column({ default: 'user' })
  role: string = 'user';

  @OneToMany(() => PaymentMethod, (paymentMethod) => paymentMethod.customer)
  paymentMethods!: PaymentMethod[];

  @OneToMany(() => Subscription, (subscription) => subscription.customer)
  subscriptions!: Subscription[];

  @OneToMany(() => Invoice, (invoice) => invoice.customer)
  invoices!: Invoice[];
}
