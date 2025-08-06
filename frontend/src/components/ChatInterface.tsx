import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Clock, MessageSquare, Mic, MicOff, Package, Phone, RefreshCw, Send, User } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import './ChatInterface.css';

// TypeScript declarations for Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

// Message interface for type safety
interface Message {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  orderDetails?: string;
  rescheduleOptions?: string[];
  whatsappSent?: boolean;
}

// Chat response interface from backend
interface ChatResponse {
  response: string;
  orderDetails?: string;
  rescheduleOptions?: string[];
  whatsappSent?: boolean;
  conversationState: string;
  requiresReschedule: boolean;
  requiresAwb: boolean;
  showDetails: boolean;
  endConversation: boolean;
  sessionExpired?: boolean;
}

/**
 * Modern AI Delivery Assistant Chat Interface
 * Features:
 * - Glassmorphism design with stunning gradients
 * - OTP verification for secure order access
 * - Session management with expiry handling
 * - WhatsApp integration for notifications
 * - Speech-to-text functionality for voice input
 * - Responsive design for all devices
 * - Smooth animations and transitions
 */
const ChatInterface: React.FC = () => {
  // State management for modern chat interface
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hello! I'm your AI Delivery Assistant. I can help you track your orders, check delivery status, and reschedule deliveries. How can I assist you today?",
      sender: 'assistant',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // OTP verification state management
  const [otpMode, setOtpMode] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState('');
  
  // Session management for security
  const [sessionEnded, setSessionEnded] = useState(false);

  // Speech-to-text state management
  const [isListening, setIsListening] = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState<SpeechRecognition | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);

  // Inactivity timer state
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const INACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes

  // Initialize speech recognition on component mount
  useEffect(() => {
    // Check if speech recognition is supported
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        setIsListening(true);
        console.log('🎤 Speech recognition started');
      };
      
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        setInputValue(transcript);
        console.log('🎤 Speech transcript:', transcript);
      };
      
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('🎤 Speech recognition error:', event.error);
        setIsListening(false);
      };
      
      recognition.onend = () => {
        setIsListening(false);
        console.log('🎤 Speech recognition ended');
      };
      
      setSpeechRecognition(recognition);
      setSpeechSupported(true);
    } else {
      console.log('🎤 Speech recognition not supported');
      setSpeechSupported(false);
    }
  }, []);

  // Initialize new session on component mount
  useEffect(() => {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);
    
    // Reset chat state to initial message with modern welcome
    setMessages([{
      id: '1',
      text: "Hello! I'm your AI Delivery Assistant. I can help you track your orders, check delivery status, and reschedule deliveries. How can I assist you today?",
      sender: 'assistant',
      timestamp: new Date()
    }]);

    // Call backend to reset session and orders for fresh start
    fetch(`http://localhost:3001/api/reset-session/${newSessionId}`, {
      method: 'POST',
    }).catch(error => {
      console.error('Error initializing session:', error);
    });
  }, []);

  // Auto-scroll to bottom for smooth UX
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /**
   * Toggle speech recognition for voice input
   */
  const toggleSpeechRecognition = () => {
    if (!speechRecognition || !speechSupported) {
      alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
      return;
    }

    if (isListening) {
      speechRecognition.stop();
    } else {
      speechRecognition.start();
    }
  };

  /**
   * Helper to clear and restart inactivity timer
   */
  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    if (!sessionEnded) {
      inactivityTimerRef.current = setTimeout(() => {
        setSessionEnded(true);
        setMessages(prev => [...prev, {
          id: (Date.now() + 2).toString(),
          text: 'Your session has expired due to inactivity. Please start a new conversation to continue.',
          sender: 'assistant',
          timestamp: new Date()
        }]);
      }, INACTIVITY_TIMEOUT);
    }
  };

  // Reset timer on mount and on every message/input change
  useEffect(() => {
    resetInactivityTimer();
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [messages, inputValue, otpValue, sessionEnded]);

  /**
   * Send message to backend with enhanced error handling
   * Supports both regular messages and OTP verification
   */
  const sendMessage = async (text: string, isOtp = false) => {
    if (!text.trim() || isLoading || !sessionId || sessionEnded) return;

    // Clear OTP errors on new input
    if (isOtp) setOtpError('');

    // Create user message with timestamp
    const userMessage: Message = {
      id: Date.now().toString(),
      text: text.trim(),
      sender: 'user',
      timestamp: new Date()
    };

    // Add message to chat with smooth animation
    setMessages(prev => [...prev, userMessage]);
    if (!isOtp) setInputValue('');
    else setOtpValue('');
    setIsLoading(true);

    try {
      // Send message to backend API
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text.trim(),
          sessionId
        }),
      });

      const data: ChatResponse & { requiresOtp?: boolean; sessionExpired?: boolean } = await response.json();

      console.log('🎯 Chat response:', data);

      // Handle session expiry with modern UI feedback
      if (data.sessionExpired) {
        console.log('🔄 Session expired detected, setting session ended');
        setSessionEnded(true);
        setMessages(prev => [...prev, {
          id: (Date.now() + 2).toString(),
          text: data.response,
          sender: 'assistant',
          timestamp: new Date()
        }]);
        return;
      }

      // Handle regular conversation end
      if (data.endConversation) {
        setSessionEnded(true);
        setMessages(prev => [...prev, {
          id: (Date.now() + 2).toString(),
          text: data.response,
          sender: 'assistant',
          timestamp: new Date()
        }]);
        return;
      }

      // Create assistant response with enhanced styling
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.response,
        sender: 'assistant',
        timestamp: new Date(),
        orderDetails: data.orderDetails,
        rescheduleOptions: data.rescheduleOptions,
        whatsappSent: data.whatsappSent
      };

      // Add assistant message with smooth animation
      setMessages(prev => [...prev, assistantMessage]);
      
      // Handle OTP mode transitions
      if (data.requiresOtp) {
        setOtpMode(true);
        setOtpError('');
      } else {
        setOtpMode(false);
        setOtpError('');
      }
      
      // Handle OTP verification errors
      if (isOtp && data.response.toLowerCase().includes('unsuccessful')) {
        setOtpError('Verification unsuccessful. Please try again.');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Show user-friendly error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
        sender: 'assistant',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      resetInactivityTimer(); // Reset timer after successful message
    }
  };

  /**
   * Handle form submission with enhanced UX
   * Supports both regular input and OTP input modes
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    resetInactivityTimer(); // Reset timer on form submission
    if (otpMode) {
      sendMessage(otpValue, true);
    } else {
      sendMessage(inputValue);
    }
  };

  /**
   * Reset session with modern loading states
   * Creates fresh chat experience for user
   */
  const resetSession = async () => {
    try {
      // Generate new session ID for security
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setSessionId(newSessionId);
      
      // Reset session on backend
      await fetch(`http://localhost:3001/api/reset-session/${newSessionId}`, {
        method: 'POST',
      });
      
      // Reset chat state with welcome message
      setMessages([{
        id: '1',
        text: "Hello! I'm your AI Delivery Assistant. I can help you track your orders, check delivery status, and reschedule deliveries. How can I assist you today?",
        sender: 'assistant',
        timestamp: new Date()
      }]);
      
      // Reset all states for fresh experience
      setSessionEnded(false);
      setOtpMode(false);
      setOtpError('');
      setInputValue('');
    } catch (error) {
      console.error('Error resetting session:', error);
    }
  };

  return (
    // Main container with glassmorphism design and smooth entrance animation
    <motion.div 
      className="chat-container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Modern Header with AI branding and enhanced styling */}
      <div className="chat-header">
        <div className="header-content">
          {/* Animated bot avatar with glow effects */}
          <div className="bot-avatar">
            <Bot size={24} />
          </div>
          <div className="header-text">
            <h1>AI Delivery Assistant</h1>
            <p>Track orders • Check status • Reschedule deliveries</p>
            {/* AI badge with animated glow effect */}
            <div className="ai-badge">
              <span>🤖 Powered by AI</span>
            </div>
          </div>
        </div>
        {/* Enhanced reset button with smooth animations */}
        <button 
          className="reset-button"
          onClick={resetSession}
          title="Start new conversation"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Messages container with custom scrollbar and smooth animations */}
      <div className="messages-container">
        <AnimatePresence>
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              className={`message ${message.sender}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              {/* Message avatar with hover effects */}
              <div className="message-avatar">
                {message.sender === 'user' ? (
                  <User size={16} />
                ) : (
                  <Bot size={16} />
                )}
              </div>
              <div className="message-content">
                {/* Message text with glassmorphism styling */}
                <div className="message-text">{message.text}</div>
                
                {/* Enhanced order details with modern card design */}
                {message.orderDetails && (
                  <motion.div 
                    className="order-details"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                  >
                    <div className="order-header">
                      <Package size={16} />
                      <span>Order Details</span>
                    </div>
                    <pre className="order-text">{message.orderDetails}</pre>
                  </motion.div>
                )}

                {/* Enhanced reschedule options with modern button design */}
                {message.rescheduleOptions && message.rescheduleOptions.length > 0 && (
                  <motion.div 
                    className="reschedule-options"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 }}
                  >
                    <div className="options-header">
                      <Clock size={16} />
                      <span>Available Delivery Slots</span>
                    </div>
                    <div className="options-list">
                      {message.rescheduleOptions.map((option, idx) => (
                        <button
                          key={idx}
                          className="option-button"
                          onClick={() => sendMessage((idx + 1).toString())}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* WhatsApp notification with enhanced styling */}
                {message.whatsappSent && (
                  <motion.div 
                    className="whatsapp-notification"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.4 }}
                  >
                    <Phone size={14} />
                    <span>WhatsApp notification sent</span>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Enhanced loading indicator with modern styling */}
        {isLoading && (
          <motion.div 
            className="message assistant loading"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="message-avatar">
              <Bot size={16} />
            </div>
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Enhanced input area with floating design and glassmorphism */}
      <form className="input-container" onSubmit={handleSubmit}>
        <div className="input-wrapper">
          {/* OTP input with enhanced styling */}
          {otpMode ? (
            <input
              type="text"
              value={otpValue}
              onChange={e => { setOtpValue(e.target.value.replace(/[^0-9]/g, '').slice(0, 6)); resetInactivityTimer(); }}
              placeholder="Enter 6-digit OTP"
              disabled={isLoading || !sessionId || sessionEnded}
              className="message-input"
              maxLength={6}
              autoFocus
            />
          ) : (
            /* Regular message input with modern styling */
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); resetInactivityTimer(); }}
              placeholder="Type your message here..."
              disabled={isLoading || !sessionId || sessionEnded}
              className="message-input"
            />
          )}
          
          {/* Speech-to-text button with enhanced styling */}
          {!otpMode && speechSupported && (
            <button
              type="button"
              onClick={toggleSpeechRecognition}
              disabled={isLoading || !sessionId || sessionEnded}
              className={`speech-button ${isListening ? 'listening' : ''}`}
              title={isListening ? 'Stop listening' : 'Start voice input'}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
          
          {/* Enhanced send button with hover effects */}
          <button
            type="submit"
            disabled={sessionEnded || (otpMode ? !otpValue.trim() || isLoading || !sessionId : !inputValue.trim() || isLoading || !sessionId)}
            className="send-button"
          >
            <Send size={18} />
          </button>
        </div>
        
        {/* Speech recognition status indicator */}
        {isListening && (
          <motion.div 
            className="speech-status"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="speech-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span>Listening... Speak now</span>
          </motion.div>
        )}
        
        {/* Enhanced error messages with modern styling */}
        {otpMode && otpError && (
          <div style={{ color: 'red', marginTop: 4, fontSize: 13 }}>{otpError}</div>
        )}
        
        {/* Modern session end experience with enhanced UI */}
        {sessionEnded && (
          <motion.div 
            className="session-end-container"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="session-end-message">
              <MessageSquare size={20} />
              <span>Session expired due to inactivity. Please start a new conversation to continue.</span>
            </div>
            {/* Enhanced start new chat button with animations */}
            <motion.button
              className="start-new-chat-button"
              onClick={resetSession}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <RefreshCw size={16} />
              <span>Start New Chat</span>
            </motion.button>
          </motion.div>
        )}
      </form>
    </motion.div>
  );
};

export default ChatInterface;