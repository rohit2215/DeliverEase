import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { WithId } from 'mongodb';
import { aiAssistant } from './aiAssistant';
import { db, DeliveryStatus } from './database';
import { RescheduleOption } from './llmHandler';
import { formatWhatsAppMessage, sendWhatsAppUpdate } from './whatsappNotifier';

const app = express();
const PORT = process.env.PORT || 3001;

// Session expiration time (2 minutes)
const SESSION_EXPIRATION = 2 * 60 * 1000; // 2 minutes 

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Store conversation state for each session
const sessions = new Map<string, {
  conversationState: string;
  currentOrder: WithId<DeliveryStatus> | null;
  rescheduleOptions: RescheduleOption[];
  lastActive: number; // Timestamp for last activity
  otp?: string;
  otpTimestamp?: number;
  otpVerified?: boolean;
}>();

// Track recently expired sessions to prevent auto-recreation
const expiredSessions = new Set<string>();

// Session cleanup function
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActive > SESSION_EXPIRATION) {
      sessions.delete(sessionId);
      expiredSessions.add(sessionId);
      console.log(`Cleaned up expired session: ${sessionId}`);
    }
  }
  
  // Clean up expired sessions tracking after 5 minutes
  const fiveMinutesAgo = now - (5 * 60 * 1000);
  for (const sessionId of expiredSessions) {
    const session = sessions.get(sessionId);
    if (!session || (session.lastActive && now - session.lastActive > 5 * 60 * 1000)) {
      expiredSessions.delete(sessionId);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredSessions, 60 * 1000);

function extractAWB(input: string): string | null {
  const match = input.match(/\bAWB\d{6}\b/i);
  return match ? match[0].toUpperCase() : null;
}

// API Routes
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Always check expiredSessions first
    if (expiredSessions.has(sessionId)) {
      return res.json({
        response: "Your session has expired due to inactivity. Please start a new conversation to continue.",
        conversationState: 'SESSION_EXPIRED',
        requiresReschedule: false,
        requiresAwb: false,
        showDetails: false,
        endConversation: true,
        sessionExpired: true
      });
    }

    // Check if session exists and is not expired
    let session = sessions.get(sessionId);
    const now = Date.now();
    
    if (!session) {
      // Session doesn't exist and wasn't recently expired - create new one
      session = {
        conversationState: 'INITIAL',
        currentOrder: null,
        rescheduleOptions: [],
        lastActive: now,
        otpVerified: false
      };
      sessions.set(sessionId, session);
      console.log(`Created new session: ${sessionId}`);
    } else {
      // Check if session has expired
      const timeSinceLastActive = now - session.lastActive;
      console.log(`Session ${sessionId}: Last active ${Math.round(timeSinceLastActive / 1000)}s ago, expiration is ${Math.round(SESSION_EXPIRATION / 1000)}s`);
      
      if (timeSinceLastActive > SESSION_EXPIRATION) {
        // Session expired - remove it and return expiration message
        sessions.delete(sessionId);
        expiredSessions.add(sessionId); // Immediately add to expiredSessions
        console.log(`Session expired: ${sessionId} (${Math.round(timeSinceLastActive / 1000)}s inactive)`);
        return res.json({
          response: "Your session has expired due to inactivity. Please start a new conversation to continue.",
          conversationState: 'SESSION_EXPIRED',
          requiresReschedule: false,
          requiresAwb: false,
          showDetails: false,
          endConversation: true,
          sessionExpired: true
        });
      } else {
        // Session is valid - update last active timestamp
        session.lastActive = now;
        console.log(`Session ${sessionId}: Updated last active time`);
      }
    }

    // OTP verification logic
    if (session.conversationState === 'AWAITING_OTP' && !session.otpVerified) {
      // Check if message is a 6-digit OTP
      if (/^\d{6}$/.test(message.trim())) {
        const now = Date.now();
        if (
          session.otp &&
          session.otpTimestamp &&
          now - session.otpTimestamp <= 2 * 60 * 1000 &&
          message.trim() === session.otp
        ) {
          session.otpVerified = true;
          session.conversationState = 'ORDER_FOUND';
          return res.json({
            response: 'Verification successful! You can now access your order details.',
            conversationState: 'ORDER_FOUND',
            requiresOtp: false
          });
        } else {
          // OTP incorrect or expired
          session.otp = undefined;
          session.otpTimestamp = undefined;
          session.otpVerified = false;
          session.conversationState = 'INITIAL';
          return res.json({
            response: 'Verification unsuccessful, try again later.',
            conversationState: 'INITIAL',
            requiresOtp: false
          });
        }
      } else {
        return res.json({
          response: 'Please enter the 6-digit OTP sent to your WhatsApp number.',
          conversationState: 'AWAITING_OTP',
          requiresOtp: true
        });
      }
    }

    // Handle slot selection if in RESCHEDULE_OPTIONS state
    if (session.conversationState === 'RESCHEDULE_OPTIONS' && session.rescheduleOptions.length > 0) {
      const slotNumber = parseInt(message.trim());
      if (!isNaN(slotNumber) && slotNumber >= 1 && slotNumber <= session.rescheduleOptions.length) {
        const selectedOption = session.rescheduleOptions[slotNumber - 1];
        
        if (session.currentOrder) {
          // Update database
          const success = await db.rescheduleOrder(session.currentOrder.awb, selectedOption.date);
          
          if (success) {
            // Refresh order details
            session.currentOrder = await db.getOrderStatus(session.currentOrder.awb);
            
            // Clear reschedule options and reset state
            session.rescheduleOptions = [];
            session.conversationState = 'ORDER_FOUND';
            
            // Send WhatsApp notification if phone number exists
            if (session.currentOrder?.customerPhone) {
              const whatsappMessage = formatWhatsAppMessage(session.currentOrder);
              sendWhatsAppUpdate(session.currentOrder.customerPhone, whatsappMessage);
            }
            
            return res.json({
              response: `Your order has been rescheduled to ${selectedOption.display}.`,
              orderDetails: session.currentOrder ? aiAssistant.formatOrderDetails(session.currentOrder) : null,
              whatsappSent: !!session.currentOrder?.customerPhone,
              conversationState: 'ORDER_FOUND',
              requiresReschedule: false,
              requiresAwb: false,
              showDetails: true,
              endConversation: false
            });
          } else {
            return res.json({
              response: "Failed to reschedule. Please try again later.",
              conversationState: 'ORDER_FOUND',
              requiresReschedule: false,
              requiresAwb: false,
              showDetails: false,
              endConversation: false
            });
          }
        }
      } else {
        return res.json({
          response: `Please enter a number between 1 and ${session.rescheduleOptions.length}.`,
          conversationState: 'RESCHEDULE_OPTIONS',
          requiresReschedule: false,
          requiresAwb: false,
          showDetails: false,
          endConversation: false
        });
      }
    }

    // Extract AWB from input
    const awbFromInput = extractAWB(message);
    if (awbFromInput) {
      // Always fetch fresh order data from DB
      const freshOrder = await db.getOrderStatus(awbFromInput);
      if (freshOrder) {
        session.currentOrder = freshOrder;
        // OTP verification required before showing order details
        if (!session.otpVerified) {
          // Generate OTP
          const otp = Math.floor(100000 + Math.random() * 900000).toString();
          session.otp = otp;
          session.otpTimestamp = Date.now();
          session.conversationState = 'AWAITING_OTP';
          // Send OTP via WhatsApp
          if (freshOrder.customerPhone) {
            await sendWhatsAppUpdate(freshOrder.customerPhone, `Your verification code is: ${otp}\nThis code is valid for 2 minutes.`);
          }
          return res.json({
            response: 'For your security, please enter the 6-digit OTP sent to your WhatsApp number to access your order details.',
            conversationState: 'AWAITING_OTP',
            requiresOtp: true
          });
        }
      } else if (!session.currentOrder) {
        // Only reset if we don't have existing order
        session.currentOrder = null;
      }
    }

    // If not verified, block access to order details
    if (session.currentOrder && !session.otpVerified) {
      return res.json({
        response: 'Please complete OTP verification to access your order details.',
        conversationState: 'AWAITING_OTP',
        requiresOtp: true
      });
    }

    // Process message with AI assistant
    const {
      response,
      requiresAwb,
      requiresReschedule,
      showDetails,
      endConversation
    } = await aiAssistant.handleUserMessage(message, session.currentOrder);

    // Update session state
    session.conversationState = aiAssistant.conversationState;

    // Generate reschedule options if needed
    let rescheduleOptions: RescheduleOption[] = [];
    if (requiresReschedule && session.currentOrder) {
      rescheduleOptions = aiAssistant.generateRescheduleOptions(
        session.currentOrder.estimatedDelivery || new Date()
      );
      session.rescheduleOptions = rescheduleOptions;
    }

    // Prepare response
    const responseData: any = {
      response,
      conversationState: session.conversationState,
      requiresReschedule,
      requiresAwb,
      showDetails,
      endConversation
    };

    if (showDetails && session.currentOrder) {
      responseData.orderDetails = aiAssistant.formatOrderDetails(session.currentOrder);
    }

    if (requiresReschedule && rescheduleOptions.length > 0) {
      responseData.rescheduleOptions = rescheduleOptions.map(opt => opt.display);
    }

    res.json(responseData);

  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      response: "I'm having trouble processing your request. Please try again."
    });
  }
});

app.post('/api/order/:awb', async (req, res) => {
  try {
    const { awb } = req.params;
    const order = await db.getOrderStatus(awb);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json({ order });
  } catch (error) {
    console.error('Order lookup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/reset-session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  sessions.delete(sessionId);
  expiredSessions.delete(sessionId); // Remove from expiredSessions on reset
  await db.resetAllOrdersToSeed();
  res.json({ message: 'Session and all orders reset successfully' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test WhatsApp endpoint
app.get('/api/test-whatsapp', async (req, res) => {
  try {
    const testPhone = '+917269063619'; // Test phone from sample data
    const testMessage = '🧪 Test WhatsApp message from Virtual Delivery Assistant';
    
    console.log('🧪 Testing WhatsApp with:');
    console.log('   Phone:', testPhone);
    console.log('   Message:', testMessage);
    console.log('   Twilio Config:', {
      accountSid: process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'NOT SET',
      authToken: process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'NOT SET',
      whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || 'NOT SET'
    });
    
    await sendWhatsAppUpdate(testPhone, testMessage);
    
    res.json({ 
      success: true, 
      message: 'WhatsApp test sent',
      config: {
        accountSid: process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'NOT SET',
        authToken: process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'NOT SET',
        whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || 'NOT SET'
      }
    });
  } catch (error) {
    console.error('❌ WhatsApp test failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      config: {
        accountSid: process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'NOT SET',
        authToken: process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'NOT SET',
        whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || 'NOT SET'
      }
    });
  }
});

// Test session expiration endpoint
app.post('/api/test-session-expiration/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.json({
      response: "Session not found.",
      sessionExpired: true
    });
  }
  
  // Manually expire the session by setting lastActive to a very old time
  session.lastActive = Date.now() - (SESSION_EXPIRATION + 60000); // 1 minute past expiration
  
  console.log(`🧪 Manually expired session: ${sessionId}`);
  
  res.json({
    response: "Session manually expired for testing.",
    sessionExpired: true
  });
});

// Start server
async function startServer() {
  try {
    await db.connect();
    console.log('📦 Database connected successfully');
    
    // Initialize database with seed data if empty
    try {
      const orderCount = await db.orders.countDocuments();
      if (orderCount === 0) {
        await db.resetAllOrdersToSeed();
        console.log('🔄 Database initialized with seed data');
      } else {
        console.log(`📊 Database has ${orderCount} existing orders`);
      }
    } catch (seedError) {
      console.error('Failed to initialize database:', seedError);
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();