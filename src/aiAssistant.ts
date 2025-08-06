import { 
  LLMResponse, 
  handleLlmRequest, 
  formatOrderDetails, 
  generateRescheduleOptions, 
  formatOptions,
  RescheduleOption  // Add this import
} from './llmHandler';
import { WithId } from 'mongodb';
import { DeliveryStatus } from './database';

export type ConversationState = 
  | 'INITIAL'
  | 'AWAITING_AWB'
  | 'ORDER_FOUND'
  | 'RESCHEDULE_OPTIONS'
  | 'RESCHEDULE_CONFIRMATION'
  | 'COMPLETED';

class AIAssistant {
  public conversationState: ConversationState = 'INITIAL';
  
  resetConversation() {
    this.conversationState = 'INITIAL';
  }

  async handleUserMessage(
    userInput: string, 
    order: WithId<DeliveryStatus> | null
  ): Promise<LLMResponse> {
    try {
      const llmResponse = await handleLlmRequest(
        userInput,
        this.conversationState,
        order
      );
      
      this.conversationState = llmResponse.nextState as ConversationState;
      return llmResponse;
    } catch (error) {
      console.error('LLM processing error:', error);
      return {
        response: "I'm having trouble accessing delivery information. Please try again later.",
        nextState: 'INITIAL'
      };
    }
  }

  // Keep helper methods that format data
  formatOrderDetails(order: WithId<DeliveryStatus>): string {
    return formatOrderDetails(order);
  }

  // Change return type to RescheduleOption[]
  generateRescheduleOptions(baseDate: Date): RescheduleOption[] {
    return generateRescheduleOptions(baseDate);
  }

  formatOptions(options: string[]): string {
    return formatOptions(options);
  }
}

export const aiAssistant = new AIAssistant();