import { db } from './database';
import { sampleOrders } from './sampleOrders';

async function seedDatabase() {
  try {
    await db.connect();
    await db.orders.deleteMany({});
    await db.orders.insertMany(sampleOrders);
    console.log('Database seeded successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await db.disconnect();
    process.exit(0);
  }
}

seedDatabase();
