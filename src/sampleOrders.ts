import { DeliveryStatus } from './database';

export const sampleOrders: DeliveryStatus[] = [
  {
    awb: "AWB123456",
    status: "Delivered",
    lastUpdate: new Date("2023-05-15"),
    estimatedDelivery: new Date("2023-05-15"),
    customerName: "John Doe",
    customerPhone: "+1234567890",
    rescheduled: false
  },
  {
    awb: "AWB789012",
    status: "In Transit",
    lastUpdate: new Date(),
    estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    customerName: "Jane Smith",
    customerPhone: "+1987654321",
    rescheduled: false
  },
  {
    awb: "AWB345678",
    status: "Delayed",
    lastUpdate: new Date(),
    estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    delayReason: "Heavy rainfall affecting transportation routes",
    customerName: "Robert Johnson",
    customerPhone: "+1122334455",
    rescheduled: false
  },
  {
    awb: "AWB999999",
    status: "In Transit",
    lastUpdate: new Date(),
    estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    customerName: "Sarah Williams",
    customerPhone: "+917269063619", // Example phone number
    rescheduled: false
  }
]; 