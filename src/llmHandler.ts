import OpenAI from 'openai';
import { db, DeliveryStatus, WithId } from './database';

export type LLMResponse = {
  response: string;
  nextState: string;
  requiresAwb?: boolean;
  requiresReschedule?: boolean;
  showDetails?: boolean;
  endConversation?: boolean;
};

export interface RescheduleOption {
  date: Date;
  display: string;
}

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Virtual Delivery Assistant"
  }
});

export async function handleLlmRequest(
  userInput: string,
  currentState: string,
  order: WithId<DeliveryStatus> | null
): Promise<LLMResponse> {
  // Define tools
  const tools: OpenAI.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "get_order_info",
        description: "Get order status or details",
        parameters: {
          type: "object",
          properties: { 
            awb: { type: "string" },
            action: { 
              type: "string", 
              enum: ["status", "details", "reschedule"] 
            }
          },
          required: ["awb", "action"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "handle_conversation",
        description: "Handle greetings or farewells",
        parameters: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["greeting", "farewell"] }
          },
          required: ["type"]
        }
      }
    }
  ];

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You're a friendly delivery assistant. Current state: ${currentState}. ${
        order ? `Order: ${order.awb}` : ''
      }. Use natural language, be helpful, and add personality.`
    },
    {
      role: "user",
      content: userInput
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "anthropic/claude-3-haiku",
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: 1000,
      temperature: 0.7 // Increased for more natural responses
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      return {
        response: "How can I help with your delivery today?",
        nextState: currentState
      };
    }

    // Parse arguments safely
    const args = toolCall.function.arguments ? 
      JSON.parse(toolCall.function.arguments) : {};

    switch (toolCall.function.name) {
      case "get_order_info":
        return handleOrderAction(args.action, order);
        
      case "handle_conversation":
        return args.type === "greeting" ? 
          handleGreeting() : handleFarewell();
        
      default:
        return {
          response: "How can I assist with your delivery?",
          nextState: "INITIAL"
        };
    }
  } catch (error) {
    console.error('LLM error:', error);
    return {
      response: "I'm having some trouble right now. Could you try again in a moment?",
      nextState: 'INITIAL'
    };
  }
}

function handleOrderAction(
  action: string,
  order: WithId<DeliveryStatus> | null
): LLMResponse {
  if (!order) {
    return {
      response: "I'd be happy to help track your order! Could you share your tracking number with me?",
      requiresAwb: true,
      nextState: "AWAITING_AWB"
    };
  }

  switch (action) {
    case "status":
      return {
        response: `Your order ${order.awb} is currently: ${order.status}.`,
        nextState: "ORDER_FOUND"
      };
      
    case "details":
      return {
        response: "Here are your order details:",
        showDetails: true,
        nextState: "ORDER_FOUND"
      };
      
    case "reschedule":
      if (!db.canReschedule(order)) {
        return {
          response: "I'm sorry, but this order can't be rescheduled right now.",
          nextState: "ORDER_FOUND"
        };
      }
      return {
        response: "Sure, I can help with that! Here are some available slots:",
        requiresReschedule: true,
        nextState: "RESCHEDULE_OPTIONS"
      };
      
    default:
      return {
        response: "How else can I help with your order?",
        nextState: "ORDER_FOUND"
      };
  }
}


function formatCompactDetails(order: WithId<DeliveryStatus>): string {
  return [
    `AWB: ${order.awb}`,
    `Status: ${order.status}`,
    `Est. Delivery: ${order.estimatedDelivery?.toLocaleDateString() || 'N/A'}`,
    order.rescheduled ? '(Rescheduled)' : ''
  ].join(' | ');
}

function handleGreeting(): LLMResponse {
  return {
    response: "Hello! How can I help with your delivery?",
    nextState: "INITIAL"
  };
}

function handleFarewell(): LLMResponse {
  return {
    response: "Thank you! Have a great day!",
    nextState: "COMPLETED",
    endConversation: true
  };
}

export function generateRescheduleOptions(baseDate: Date): RescheduleOption[] {
  const options: RescheduleOption[] = [];
  for (let i = 1; i <= 3; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    
    // Set time based on slot type
    const slotType = ['Morning', 'Afternoon', 'Evening'][i % 3];
    if (slotType === 'Morning') date.setHours(9, 0, 0, 0);
    else if (slotType === 'Afternoon') date.setHours(13, 0, 0, 0);
    else if (slotType === 'Evening') date.setHours(18, 0, 0, 0);
    
    const display = `${date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    })} | ${slotType}`;

    options.push({ date, display });
  }
  return options;
}

export function formatOptions(options: string[]): string {
  return options.map((opt, i) => `${i+1}. ${opt}`).join('\n');
}

export function formatOrderDetails(order: WithId<DeliveryStatus>): string {
  return [
    `AWB: ${order.awb}`,
    `Status: ${order.status}`,
    `Est. Delivery: ${order.estimatedDelivery?.toLocaleDateString() || 'N/A'}`,
    ...(order.scheduledDelivery ? [`Scheduled Delivery: ${order.scheduledDelivery.toLocaleString()}`] : []),
    `Last Updated: ${order.lastUpdate.toLocaleString()}`,
    order.rescheduled ? '(Rescheduled)' : ''
  ].join('\n');
}