import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Number } from "../models/Number.js";

const startMessaging = async () => {
  try {
    // Fetch all numbers from database
    const numbers = await Number.find({});
    
    if (numbers.length === 0) {
      console.log("No accounts found in database");
      return;
    }

    console.log(`Starting messaging for ${numbers.length} accounts`);

    // Start messaging for each account in parallel
    const messagingPromises = numbers.map(async (numberDoc) => {
      return startAccountMessaging(numberDoc);
    });

    // Wait for all messaging processes to complete (they run indefinitely)
    await Promise.allSettled(messagingPromises);
    
  } catch (error) {
    console.error("Error in startMessaging:", error);
  }
};

const startAccountMessaging = async (numberDoc) => {
  let client = null;
  
  try {
    // Create Telegram client for this account
    client = new TelegramClient(
      new StringSession(numberDoc.session),
      parseInt(process.env.API_ID), // Your API ID
      process.env.API_HASH, // Your API hash
      {
        connectionRetries: 5,
      }
    );

    await client.connect();
    console.log(`Connected account: ${numberDoc.phone}`);

    // Get all groups this account belongs to
    let groups = await getAccountGroups(client, numberDoc.phone);
    
    if (groups.length === 0) {
      console.log(`No groups found for account: ${numberDoc.phone}`);
      return;
    }

    console.log(`Account ${numberDoc.phone} belongs to ${groups.length} groups`);

    // Start the messaging loop for this account
    await messagingLoop(client, numberDoc, groups);

  } catch (error) {
    console.error(`Error with account ${numberDoc.phone}:`, error);
  } finally {
    // Clean up connection
    if (client && client.connected) {
      try {
        await client.disconnect();
        console.log(`Disconnected account: ${numberDoc.phone}`);
      } catch (disconnectError) {
        console.error(`Error disconnecting ${numberDoc.phone}:`, disconnectError);
      }
    }
  }
};

const getAccountGroups = async (client, phone) => {
  try {
    const dialogs = await client.getDialogs({});
    const groups = [];

    for (const dialog of dialogs) {
      // Check if it's a group or supergroup
      if (dialog.isGroup || dialog.isChannel) {
        groups.push({
          id: dialog.id,
          title: dialog.title,
          accessHash: dialog.entity.accessHash,
        });
      }
    }

    return groups;
  } catch (error) {
    console.error(`Error getting groups for ${phone}:`, error);
    return [];
  }
};

const messagingLoop = async (client, numberDoc, groups) => {
  const phone = numberDoc.phone;
  const GROUP_MESSAGE_LIMIT = 60 * 1000; // Groups allow 1 message per minute
  const MIN_SEND_INTERVAL = 3 * 1000; // 3 seconds between any attempts (flood protection)
  
  // Track last successful send time for each group ID
  const groupLastSent = new Map();
  let messagesSent = 0;
  let cycleCount = 0;
  
  console.log(`[${phone}] Starting fast messaging with group rate limiting for ${groups.length} groups`);

  while (true) {
    try {
      // Check if we have messages to send
      if (!numberDoc.message || numberDoc.message.length === 0) {
        console.log(`[${phone}] No messages available, waiting 30s...`);
        await sleep(30 * 1000);
        continue;
      }

      // Find groups that are available (1 minute has passed since last message)
      const now = Date.now();
      const availableGroups = [];
      
      for (const group of groups) {
        const lastSent = groupLastSent.get(group.id) || 0;
        const timeSinceLastSent = now - lastSent;
        
        if (timeSinceLastSent >= GROUP_MESSAGE_LIMIT) {
          availableGroups.push({
            ...group,
            timeSinceLastSent
          });
        }
      }

      if (availableGroups.length === 0) {
        // Calculate when the next group will become available
        let shortestWait = Infinity;
        let nextAvailableGroup = null;
        
        for (const group of groups) {
          const lastSent = groupLastSent.get(group.id) || 0;
          const waitTime = GROUP_MESSAGE_LIMIT - (now - lastSent);
          
          if (waitTime > 0 && waitTime < shortestWait) {
            shortestWait = waitTime;
            nextAvailableGroup = group;
          }
        }
        
        if (shortestWait !== Infinity && shortestWait > 0) {
          console.log(`[${phone}] All ${groups.length} groups in cooldown. Next: ${nextAvailableGroup?.title} in ${Math.ceil(shortestWait/1000)}s`);
          await sleep(shortestWait + 500); // Wait with small buffer
          continue;
        }
      }

      // Pick a random available group
      const selectedGroup = availableGroups[Math.floor(Math.random() * availableGroups.length)];
      
      // Pick a random message
      const randomMessage = getRandomMessage(numberDoc.message);

      console.log(`[${phone}] Attempting send to: ${selectedGroup.title} (${availableGroups.length}/${groups.length} left)`);

      // Send message
      const sendResult = await sendMessageToGroup(client, selectedGroup, randomMessage, phone);
      
      if (sendResult.success) {
        // Record successful send time
        groupLastSent.set(selectedGroup.id, now);
        messagesSent++;
        console.log(`[${phone}] ✅ sent to ${selectedGroup.title} | Next allowed: ${new Date(now + GROUP_MESSAGE_LIMIT).toLocaleTimeString()}`);
      } else if (sendResult.waitTime) {
        // Telegram gave us specific wait time - extend the cooldown
        const extendedCooldown = now + (sendResult.waitTime * 1000);
        groupLastSent.set(selectedGroup.id, extendedCooldown - GROUP_MESSAGE_LIMIT);
        console.log(`[${phone}] ⏱️  Extended cooldown for ${selectedGroup.title}: ${sendResult.waitTime}s total`);
      }

      // Minimum gap between any send attempts
      await sleep(MIN_SEND_INTERVAL);

    } catch (error) {
      console.error(`[${phone}] Error in messaging loop:`, error);
      await sleep(30 * 1000);
    }

    // Refetch groups periodically
    if (messagesSent > 0 && messagesSent % 100 === 0) {
      cycleCount++;
      console.log(`\n\n[${phone}] ===========================================================\n Cycle ${cycleCount}: Refetching groups after ${messagesSent} total messages\n===========================================================\n\n\n`);
      try {
        const updatedGroups = await getAccountGroups(client, phone);
        if (updatedGroups.length !== groups.length) {
          console.log(`[${phone}] Groups updated: ${groups.length} → ${updatedGroups.length}`);
          // Reset cooldowns for new groups
          const oldGroupIds = new Set(groups.map(g => g.id));
          for (const newGroup of updatedGroups) {
            if (!oldGroupIds.has(newGroup.id)) {
              console.log(`[${phone}] New group detected: ${newGroup.title}`);
            }
          }
        }
        groups = updatedGroups;
      } catch (refetchError) {
        console.error(`[${phone}] Error refetching groups:`, refetchError);
      }
    }
  }
};

const sendMessageToGroup = async (client, group, message, phone) => {
  try {
    await client.sendMessage(group.id, {
      message: message,
    });
    
    return { success: true };
    
  } catch (error) {
    console.error(`[${phone}] ❌ Failed to send to ${group.title}: ${error.message}`);
    
    // Extract wait time from flood wait errors
    if (error.message.includes('wait of') && error.message.includes('seconds')) {
      const match = error.message.match(/wait of (\d+) seconds/);
      const waitTime = match ? parseInt(match[1]) : 60;
      return { success: false, waitTime: waitTime };
    }
    
    // Handle other specific errors
    if (error.message.includes('USER_BANNED')) {
      console.log(`[${phone}] 🚫 Banned from: ${group.title}`);
    } else if (error.message.includes('CHAT_WRITE_FORBIDDEN')) {
      console.log(`[${phone}] 🚫 No write permission: ${group.title}`);
    } else if (error.message.includes('CHAT_ADMIN_REQUIRED')) {
      console.log(`[${phone}] 🚫 Admin required: ${group.title}`);
    }
    
    return { success: false };
  }
};

const getRandomMessage = (messages) => {
  if (!messages || messages.length === 0) {
    return "Hello!"; // Default message
  }
  
  const randomIndex = Math.floor(Math.random() * messages.length);
  return messages[randomIndex];
};

const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Graceful shutdown handler
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  process.exit(0);
});

export default startMessaging;