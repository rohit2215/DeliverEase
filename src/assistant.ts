import { db } from './database';
import { aiAssistant } from './aiAssistant';
import * as readline from 'readline';
import { WithId } from 'mongodb';
import { DeliveryStatus } from './database';
import { RescheduleOption } from './llmHandler';
import { sendWhatsAppUpdate, formatWhatsAppMessage } from './whatsappNotifier';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function extractAWB(input: string): string | null {
  const match = input.match(/\bAWB\d{6}\b/i);
  return match ? match[0].toUpperCase() : null;
}

async function main() {
  try {
    await db.connect();
    console.log("\n🚀 Virtual Delivery Assistant");
    console.log("Type 'exit' or 'quit' to end the conversation\n");

    let currentOrder: WithId<DeliveryStatus> | null = null;
    let rescheduleOptions: RescheduleOption[] = [];

    const startConversation = async () => {
      rl.question('You: ', async (userInput) => {
        // Handle exit/quit
        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
          console.log(`\nAssistant: Thank you! Have a great day!`);
          await shutdown();
          return;
        }

        // Handle slot selection if in RESCHEDULE_OPTIONS state
        if (aiAssistant.conversationState === 'RESCHEDULE_OPTIONS' && rescheduleOptions.length > 0) {
          const slotNumber = parseInt(userInput.trim());
          if (!isNaN(slotNumber)) {
            if (slotNumber >= 1 && slotNumber <= rescheduleOptions.length) {
              const selectedOption = rescheduleOptions[slotNumber - 1];
              
              if (currentOrder) {
                // Update database
                const success = await db.rescheduleOrder(currentOrder.awb, selectedOption.date);
                
                if (success) {
                  // Refresh order details
                  currentOrder = await db.getOrderStatus(currentOrder.awb);
                  
                  // Show confirmation
                  console.log(`\nAssistant: Your order has been rescheduled to ${selectedOption.display}.`);
                  console.log("\nUpdated order details:");
                  
                  // Add null check before using currentOrder
                  if (currentOrder) {
                    console.log(aiAssistant.formatOrderDetails(currentOrder));
                    
                    // Send WhatsApp notification if phone number exists
                    if (currentOrder.customerPhone) {
                      const message = formatWhatsAppMessage(currentOrder);
                      sendWhatsAppUpdate(currentOrder.customerPhone, message);
                      console.log("\nAssistant: A confirmation has been sent to your WhatsApp.");
                    }
                  } else {
                    console.log("\nAssistant: Failed to fetch updated order details.");
                  }
                } else {
                  console.log("\nAssistant: Failed to reschedule. Please try again later.");
                }
              } else {
                console.log("\nAssistant: Order not found. Please restart the conversation.");
              }
            } else {
              console.log(`\nAssistant: Please enter a number between 1 and ${rescheduleOptions.length}.`);
            }
          } else {
            console.log("\nAssistant: Please enter a valid slot number.");
          }
          
          // Reset conversation state
          aiAssistant.conversationState = 'ORDER_FOUND';
          startConversation();
          return;
        }

        const awbFromInput = extractAWB(userInput);
        if (awbFromInput && !currentOrder) {
          currentOrder = await db.getOrderStatus(awbFromInput);
        }

        const {
          response,
          requiresAwb,
          requiresReschedule,
          showDetails,
          endConversation
        } = await aiAssistant.handleUserMessage(userInput, currentOrder);

        if (endConversation) {
          console.log(`\nAssistant: ${response}`);
          await shutdown();
          return;
        }

        if (showDetails && currentOrder) {
          console.log(`\nAssistant: ${response}`);
          console.log(aiAssistant.formatOrderDetails(currentOrder));
          startConversation();
          return;
        }

        console.log(`\nAssistant: ${response}`);

        if (requiresReschedule && currentOrder) {
          rescheduleOptions = aiAssistant.generateRescheduleOptions(
            currentOrder.estimatedDelivery || new Date()
          );
          console.log("\nAvailable delivery slots:");
          const displayOptions = rescheduleOptions.map(opt => opt.display);
          console.log(aiAssistant.formatOptions(displayOptions));
          console.log("\nPlease enter the number of your preferred slot (1-3)");
        }

        if (requiresAwb && !currentOrder) {
          rl.question('\nAssistant: Please enter your AWB number: ', async (awb) => {
            const extractedAwb = extractAWB(awb) || awb.trim();
            currentOrder = await db.getOrderStatus(extractedAwb);
            
            if (!currentOrder) {
              console.log("\nAssistant: Order not found. Please check your AWB number.");
            }
            
            startConversation();
          });
          return;
        }

        startConversation();
      });
    };

    startConversation();
  } catch (error) {
    console.error('Initialization error:', error);
    process.exit(1);
  }
}

async function shutdown() {
  try {
    await db.disconnect();
    rl.close();
  } catch (error) {
    console.error('Shutdown error:', error);
  } finally {
    process.exit(0);
  }
}

main();