import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { WithId } from 'mongodb';
import { aiAssistant } from '../src/aiAssistant';
import { db, DeliveryStatus } from '../src/database';
import { RescheduleOption } from '../src/llmHandler';
import { sendWhatsAppUpdate } from '../src/whatsappNotifier';

const app = express();

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

// Initialize database connection
let dbInitialized = false;

async function initializeDB() {
  if (!dbInitialized) {
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
      
      dbInitialized = true;
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }
}

// API Routes
app.post('/api/chat', async (req, res) => {
  try {
    await initializeDB();
    
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
      // Update last active time
      session.lastActive = now;
    }

    // Process message with AI assistant
    const response = await aiAssistant(message, sessionId, session);
    
    res.json(response);
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ 
      response: "I'm sorry, I encountered an error. Please try again.",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Reset session endpoint
app.post('/api/reset-session/:sessionId', async (req, res) => {
  try {
    await initializeDB();
    
    const { sessionId } = req.params;
    
    // Clear session data
    sessions.delete(sessionId);
    expiredSessions.delete(sessionId);
    
    // Reset database orders to seed data
    await db.resetAllOrdersToSeed();
    
    console.log(`Session reset: ${sessionId}`);
    res.json({ success: true, message: 'Session reset successfully' });
  } catch (error) {
    console.error('Error resetting session:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
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

// Export for Vercel serverless
export default app; 