import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;
const twilioPhone = process.env.TWILIO_WHATSAPP_NUMBER!;

const client = twilio(accountSid, authToken);

export async function sendWhatsAppUpdate(phone: string, message: string) {
  // Check if Twilio credentials are configured
  if (!accountSid || !authToken || !twilioPhone) {
    console.log('⚠️ Twilio credentials not configured. WhatsApp notifications disabled.');
    console.log('📱 To enable WhatsApp notifications, set these environment variables:');
    console.log('   - TWILIO_ACCOUNT_SID');
    console.log('   - TWILIO_AUTH_TOKEN');
    console.log('   - TWILIO_WHATSAPP_NUMBER');
    return;
  }

  try {
    // Use Twilio WhatsApp sandbox number if the configured number doesn't work
    const whatsappFrom = twilioPhone === '+14066064690' ? '+14155238886' : twilioPhone;
    
    console.log('📱 Sending WhatsApp message:');
    console.log('   From:', `whatsapp:${whatsappFrom}`);
    console.log('   To:', `whatsapp:${phone}`);
    console.log('   Message:', message);
    
    await client.messages.create({
      body: message,
      from: `whatsapp:${whatsappFrom}`,
      to: `whatsapp:${phone}`
    });
    console.log('✅ WhatsApp update sent successfully');
  } catch (error) {
    console.error('❌ WhatsApp send error:', error);
    console.log('📱 To fix WhatsApp notifications:');
    console.log('   1. Join Twilio WhatsApp sandbox by sending "join <code>" to +14155238886');
    console.log('   2. Get the join code from your Twilio console');
    console.log('   3. Or use a production WhatsApp number approved by Twilio');
  }
}

// Helper to format order details for WhatsApp
export function formatWhatsAppMessage(order: any): string {
  return `📦 Order Update: ${order.awb}\n` +
         `🔄 Status: ${order.status}\n` +
         `📅 Scheduled Delivery: ${order.scheduledDelivery?.toLocaleString() || 'N/A'}\n` +
         `⏰ Last Updated: ${order.lastUpdate.toLocaleString()}\n` +
         `\nThank you for using our service!`;
}