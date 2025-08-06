import * as dotenv from 'dotenv';
import { Collection, Db, MongoClient, WithId as MongoWithId } from 'mongodb';
import { sampleOrders } from './sampleOrders';

dotenv.config();

export interface DeliveryStatus {
  awb: string;
  status: 'Processing' | 'Shipped' | 'In Transit' | 'Out for Delivery' | 'Delivered' | 'Delayed' | 'Rescheduled';
  lastUpdate: Date;
  estimatedDelivery?: Date;
  scheduledDelivery?: Date;
  delayReason?: string;
  customerName?: string;
  customerPhone?: string;
  rescheduled?: boolean;
}

// Export WithId type for use in other modules
export type WithId<T> = MongoWithId<T>;

class Database {
  private client: MongoClient;
  private db!: Db;
  public orders!: Collection<DeliveryStatus>;

  constructor() {
    this.client = new MongoClient(process.env.MONGODB_URI!);
  }

  async connect() {
    await this.client.connect();
    this.db = this.client.db(process.env.DB_NAME);
    this.orders = this.db.collection<DeliveryStatus>(process.env.COLLECTION_NAME!);
    console.log('Connected to database');
  }

  async disconnect() {
    await this.client.close();
    console.log('Database disconnected');
  }

  async getOrderStatus(awb: string): Promise<WithId<DeliveryStatus> | null> {
    return this.orders.findOne({ awb });
  }

  async rescheduleOrder(awb: string, newDate: Date): Promise<boolean> {
    try {
      const result = await this.orders.updateOne(
        { awb },
        { 
          $set: { 
            scheduledDelivery: newDate,
            status: 'Rescheduled',
            rescheduled: true,
            lastUpdate: new Date()
          } 
        }
      );
      return result.modifiedCount === 1;
    } catch (error) {
      console.error('Rescheduling error:', error);
      return false;
    }
  }

  canReschedule(order: WithId<DeliveryStatus>): boolean {
    return order.status !== 'Delivered' && 
           order.status !== 'Out for Delivery' &&
           !order.rescheduled;
  }

  async resetAllOrdersToSeed() {
    try {
      // Clear all existing orders
      await this.orders.deleteMany({});
      console.log('Cleared existing orders');
      
      // Insert fresh sample orders with explicit _id removal
      const ordersToInsert = sampleOrders.map(order => {
        const { _id, ...orderWithoutId } = order as any;
        return orderWithoutId;
      });
      
      const result = await this.orders.insertMany(ordersToInsert);
      console.log(`Inserted ${result.insertedCount} new orders`);
    } catch (error) {
      console.error('Error resetting orders to seed:', error);
      throw error;
    }
  }
}

export const db = new Database();