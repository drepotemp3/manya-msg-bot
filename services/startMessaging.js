import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import Number from "../models/Number.js";
import adMessages from "../utils/adMessages.js";
import "dotenv/config";
import handleArrErr from "../helpers/handleAccErr.js";
import { mongoose } from "mongoose";
import User from "../models/User.js";

const loadUsers = async () => {
try {
    const users = await User.find();
  if (users.length > 0) {
    let allUsers = [];
    for (const u of users) {
      allUsers.push(u.chatId);
    }

    global.users = allUsers;
  }
  global.messaging = true;
} catch (error) {
  console.log("Error loading users\n",error)
}
};

// Your proxy config from IPRoyal
const proxyHost = process.env.proxyHost || "geo.iproyal.com";
const proxyPort = parseInt(process.env.proxyPort, 10) || 12321;
const proxyUsername = process.env.proxyUsername;
const proxyPassword = process.env.proxyPassword;

// Global tracking for last picked message indices per phone number
const lastPickedMessageIndices = new Map();

// Comprehensive user agent pool for randomization
const getUserAgent = () => {
  const userAgents = [
    // Windows Chrome
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",

    // Windows Firefox
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",

    // Windows Edge
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",

    // macOS Chrome
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

    // macOS Safari
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",

    // macOS Firefox
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13.6; rv:120.0) Gecko/20100101 Firefox/120.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.1; rv:121.0) Gecko/20100101 Firefox/121.0",

    // Linux Chrome
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",

    // Android Chrome
    "Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",

    // Android Firefox
    "Mozilla/5.0 (Mobile; rv:121.0) Gecko/121.0 Firefox/121.0",
    "Mozilla/5.0 (Mobile; rv:120.0) Gecko/120.0 Firefox/120.0",

    // iPhone Safari
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",

    // iPhone Chrome
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0.6045.169 Mobile/15E148 Safari/604.1",

    // iPad Safari
    "Mozilla/5.0 (iPad; CPU OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 16_7_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",

    // Opera
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0",

    // Brave
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Brave/120.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Brave/120.0.0.0",

    // Vivaldi
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Vivaldi/6.5.3206.39",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Vivaldi/6.5.3206.39",

    // Samsung Internet
    "Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/22.0 Chrome/114.0.0.0 Mobile Safari/537.36",

    // WebView variants
    "Mozilla/5.0 (Linux; Android 14; SM-G998B wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; Pixel 7 wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.0.0 Mobile Safari/537.36",

    // Older but still common
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
  ];

  return userAgents[Math.floor(Math.random() * userAgents.length)];
};

// Generate random device model
const getRandomDeviceModel = () => {
  const devices = [
    "Desktop",
    "Laptop",
    "iPhone15,2",
    "iPhone14,7",
    "iPhone13,2",
    "SM-G998B",
    "SM-G991B",
    "Pixel 8",
    "Pixel 7",
    "OnePlus 11",
    "MacBookPro18,1",
    "MacBookAir10,1",
    "iMac21,1",
    "Surface Pro 9",
    "ThinkPad X1",
    "Dell XPS 13",
    "HP Spectre",
    "ASUS ZenBook",
    "iPad13,1",
    "iPad14,1",
    "Galaxy Tab S9",
    "Nokia G60",
    "Xiaomi 13",
    "Oppo Find X6",
  ];
  return devices[Math.floor(Math.random() * devices.length)];
};

// Generate random system version
const getRandomSystemVersion = () => {
  const versions = [
    "10.0",
    "11.0",
    "12.0",
    "13.0",
    "14.0",
    "15.0",
    "16.0",
    "17.0",
    "10.15.7",
    "11.7.10",
    "12.6.9",
    "13.6.1",
    "14.1.1",
    "14.2",
    "Ubuntu 22.04",
    "Ubuntu 20.04",
    "Fedora 38",
    "Debian 12",
  ];
  return versions[Math.floor(Math.random() * versions.length)];
};

// Generate random app version
const getRandomAppVersion = () => {
  const major = Math.floor(Math.random() * 5) + 8; // 8-12
  const minor = Math.floor(Math.random() * 10); // 0-9
  const patch = Math.floor(Math.random() * 20); // 0-19
  return `${major}.${minor}.${patch}`;
};

// Generate random language codes
const getRandomLangCode = () => {
  const langs = [
    "en",
    "en-US",
    "en-GB",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "ru",
    "ja",
    "ko",
    "zh",
    "ar",
    "hi",
  ];
  return langs[Math.floor(Math.random() * langs.length)];
};

const startMessaging = async () => {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: "mania-msg-bot",
  });
  await loadUsers()

  while (true) {
    try {
      // Fetch all numbers from database
      const numbers = await Number.find({});

      if (numbers.length === 0) {
        console.log("No accounts found in database. Retrying in 10s...");
        await new Promise((resolve) => setTimeout(resolve, 10000)); // wait 10s
        continue; // loop again
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
      await new Promise((resolve) => setTimeout(resolve, 10000)); // wait before retry
    }
  }
};

const startAccountMessaging = async (numberDoc) => {
  let client = null;

  try {
    // Generate random device fingerprint for this account
    const randomUserAgent = getUserAgent();
    const randomDeviceModel = getRandomDeviceModel();
    const randomSystemVersion = getRandomSystemVersion();
    const randomAppVersion = getRandomAppVersion();
    const randomLangCode = getRandomLangCode();
    const randomSystemLangCode = getRandomLangCode();

    console.log(
      `[${numberDoc.phone}] Using device: ${randomDeviceModel} | System: ${randomSystemVersion} | App: ${randomAppVersion}`
    );

    // Create Telegram client for this account with randomized fingerprint
    client = new TelegramClient(
      new StringSession(numberDoc.session),
      parseInt(process.env.API_ID), // Your API ID
      process.env.API_HASH, // Your API hash
      {
        connectionRetries: 5,
        deviceModel: randomDeviceModel,
        systemVersion: randomSystemVersion,
        appVersion: randomAppVersion,
        langCode: randomLangCode,
        systemLangCode: randomSystemLangCode,
        useIPv6: Math.random() < 0.3, // 30% chance to use IPv6
        userAgent: randomUserAgent,
        // 🔑 Proxy settings
        proxy: {
          ip: proxyHost,
          port: proxyPort,
          socksType: 5,
          username: proxyUsername,
          password: proxyPassword,
        },
      }
    );

    // Create Telegram client for this account
    client = new TelegramClient(
      new StringSession(numberDoc.session),
      parseInt(process.env.API_ID),
      process.env.API_HASH,
      {
        connectionRetries: 5,
        deviceModel: randomDeviceModel,
        systemVersion: randomSystemVersion,
        appVersion: randomAppVersion,
        langCode: randomLangCode,
        systemLangCode: randomSystemLangCode,
        useIPv6: Math.random() < 0.3,
        userAgent: randomUserAgent,
        // 🔑 Proxy settings
        proxy: {
          ip: proxyHost,
          port: proxyPort,
          socksType: 5,
          username: proxyUsername,
          password: proxyPassword,
        },
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

    console.log(
      `Account ${numberDoc.phone} belongs to ${groups.length} groups`
    );

    // Start the messaging loop for this account
    await messagingLoop(client, numberDoc, groups);
  } catch (error) {
    console.error(`Error with account ${numberDoc.phone}:`, error);
    handleArrErr(error, numberDoc);
  } finally {
    // Clean up connection
    if (client && client.connected) {
      try {
        await client.disconnect();
        console.log(`Disconnected account: ${numberDoc.phone}`);
      } catch (disconnectError) {
        console.error(
          `Error disconnecting ${numberDoc.phone}:`,
          disconnectError
        );
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
    handleArrErr(error, phone, true);
    return [];
  }
};

// Simulate human activity to appear more natural
const simulateHumanActivity = async (client, groups, phone) => {
  try {
    const activities = [
      // Read recent messages (most common human activity)
      async () => {
        const randomGroup = groups[Math.floor(Math.random() * groups.length)];
        await client.getMessages(randomGroup.id, {
          limit: Math.floor(Math.random() * 5) + 1,
        });
        console.log(
          `[${phone}] 👁️  Simulated reading messages in: ${randomGroup.title}`
        );
      },

      // Check dialog list (users frequently check chat list)
      async () => {
        await client.getDialogs({ limit: 10 });
        console.log(`[${phone}] 📱 Simulated checking chat list`);
      },

      // Get user info (people check profiles)
      async () => {
        const me = await client.getMe();
        console.log(`[${phone}] 👤 Simulated profile activity`);
      },
    ];

    // Pick random activity
    const randomActivity =
      activities[Math.floor(Math.random() * activities.length)];
    await randomActivity();
  } catch (error) {
    handleArrErr(error, phone, true);
    // Silently ignore simulation errors - they're not critical
    console.log(`[${phone}] Activity simulation failed (non-critical)`);
  }
};

// Function to pick a random template and inject username
function getMessage(numberDoc) {
  const phone = numberDoc.phone;
  const username = numberDoc.username || "friend"; // fallback if no username

  let selectedIndex;
  const lastIndex = lastPickedMessageIndices.get(phone);

  // Ensure we don't pick the same message index as last time
  do {
    selectedIndex = Math.floor(Math.random() * adMessages.length);
  } while (selectedIndex === lastIndex && adMessages.length > 1);

  // Store the selected index for this phone number
  lastPickedMessageIndices.set(phone, selectedIndex);

  // Get the selected template
  const selectedTemplate = adMessages[selectedIndex];

  // Replace {username} placeholder with actual username
  const messageWithUsername = selectedTemplate.replace(/{username}/g, username);

  // Apply text randomization by newlines
  return randomizeTextByNewlines(messageWithUsername);
}

function randomizeTextByNewlines(text) {
  // Split the text into an array of lines
  const lines = text.split("\n");

  // Only shuffle if there are multiple lines
  if (lines.length <= 1) {
    return text;
  }

  // Fisher-Yates shuffle algorithm to randomize the lines
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }

  // Join the shuffled lines back together
  return lines.join("\n");
}

const messagingLoop = async (client, numberDoc, groups) => {
  const phone = numberDoc.phone;

  // Track last successful send time for each group ID
  const groupLastSent = new Map();
  // Smart group selection - track recently used groups
  const recentlyUsedGroups = new Set();
  const MAX_RECENT_GROUPS = Math.min(5, Math.floor(groups.length / 3));

  let messagesSent = 0;
  let cycleCount = 0;

  console.log(
    `[${phone}] Starting fast messaging with group rate limiting for ${groups.length} groups`
  );

  while (true) {
    const GROUP_MESSAGE_LIMIT = (60 + Math.random() * 120) * 1000; // 60-180s random
    const MIN_SEND_INTERVAL = (3 + Math.random() * 7) * 1000; // 3-10s random
    try {
      // Find groups that are available (1 minute has passed since last message)
      const now = Date.now();
      const availableGroups = [];

      for (const group of groups) {
        const lastSent = groupLastSent.get(group.id) || 0;
        const timeSinceLastSent = now - lastSent;

        if (timeSinceLastSent >= GROUP_MESSAGE_LIMIT) {
          availableGroups.push({
            ...group,
            timeSinceLastSent,
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
          console.log(
            `[${phone}] All ${groups.length} groups in cooldown. Next: ${
              nextAvailableGroup?.title
            } in ${Math.ceil(shortestWait / 1000)}s`
          );
          await sleep(shortestWait + 500); // Wait with small buffer
          continue;
        }
      }

      // Smart group selection - avoid recently used groups
      const selectSmartGroup = (availableGroups) => {
        // Filter out recently used groups first
        const freshGroups = availableGroups.filter(
          (group) => !recentlyUsedGroups.has(group.id)
        );
        const groupsToChooseFrom =
          freshGroups.length > 0 ? freshGroups : availableGroups;

        // Random selection from filtered groups
        return groupsToChooseFrom[
          Math.floor(Math.random() * groupsToChooseFrom.length)
        ];
      };

      // Use smart selection instead of pure random
      const selectedGroup = selectSmartGroup(availableGroups);

      // Get a varied message using the new system
      const randomMessage = getMessage(numberDoc);

      console.log(
        `[${phone}] Attempting send to: ${selectedGroup.title} (${availableGroups.length}/${groups.length} left)`
      );

      // Send message
      const sendResult = await sendMessageToGroup(
        client,
        selectedGroup,
        randomMessage,
        phone
      );

      if (sendResult.success) {
        // Record successful send time
        groupLastSent.set(selectedGroup.id, now);
        messagesSent++;

        // Update recently used groups tracking
        recentlyUsedGroups.add(selectedGroup.id);
        if (recentlyUsedGroups.size > MAX_RECENT_GROUPS) {
          // Remove oldest entry (convert to array, remove first, convert back)
          const groupsArray = Array.from(recentlyUsedGroups);
          recentlyUsedGroups.delete(groupsArray[0]);
        }

        console.log(
          `[${phone}] ✅ sent to ${
            selectedGroup.title
          } | Next allowed: ${new Date(
            now + GROUP_MESSAGE_LIMIT
          ).toLocaleTimeString()}`
        );
      } else if (sendResult.waitTime) {
        // Telegram gave us specific wait time - extend the cooldown
        const extendedCooldown = now + sendResult.waitTime * 1000;
        groupLastSent.set(
          selectedGroup.id,
          extendedCooldown - GROUP_MESSAGE_LIMIT
        );
        console.log(
          `[${phone}] ⏱️  Extended cooldown for ${selectedGroup.title}: ${sendResult.waitTime}s total`
        );
      }

      // Human activity simulation (30% chance)
      if (Math.random() < 0.3) {
        await simulateHumanActivity(client, groups, phone);
      }

      // Minimum gap between any send attempts
      await sleep(MIN_SEND_INTERVAL);

      // Random human-like breaks every few messages
      const BREAK_FREQUENCY = 5 + Math.floor(Math.random() * 10); // 5-15 messages
      if (messagesSent % BREAK_FREQUENCY === 0 && messagesSent > 0) {
        const BREAK_DURATION = (2 + Math.random() * 2) * 60 * 1000; // 2-4 min break
        console.log(
          `[${phone}] Taking human-like break for ${Math.ceil(
            BREAK_DURATION / 60000
          )} minutes...`
        );
        await sleep(BREAK_DURATION);
      }
    } catch (error) {
      handleArrErr(error, numberDoc);

      console.error(`[${phone}] Error in messaging loop:`, error);
      await sleep(30 * 1000);
    }

    // Refetch groups periodically
    if (messagesSent > 0 && messagesSent % 100 === 0) {
      cycleCount++;
      console.log(
        `\n\n[${phone}] ===========================================================\n Cycle ${cycleCount}: Refetching groups after ${messagesSent} total messages\n===========================================================\n\n\n`
      );
      try {
        const updatedGroups = await getAccountGroups(client, phone);
        if (updatedGroups.length !== groups.length) {
          console.log(
            `[${phone}] Groups updated: ${groups.length} → ${updatedGroups.length}`
          );
          // Reset cooldowns for new groups
          const oldGroupIds = new Set(groups.map((g) => g.id));
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
    console.error(
      `[${phone}] ❌ Failed to send to ${group.title}: ${error.message}`
    );

    // Extract wait time from flood wait errors
    if (
      error.message.includes("wait of") &&
      error.message.includes("seconds")
    ) {
      const match = error.message.match(/wait of (\d+) seconds/);
      const waitTime = match ? parseInt(match[1]) : 60;
      return { success: false, waitTime: waitTime };
    }

    // Handle other specific errors
    handleArrErr(error, phone, true);

    return { success: false };
  }
};

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// Graceful shutdown handler
process.on("SIGINT", () => {
  console.log("\nReceived SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM, shutting down gracefully...");
  process.exit(0);
});

export default startMessaging;
if (process.argv[2] === "runMessaging") {
  (async () => {
    try {
      await startMessaging(); // runs the infinite messaging loop
    } catch (err) {
      console.error("Messaging crashed:", err);
      process.exit(1);
    }
  })();
}
