import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import Number from "../models/Number.js";
import adMessages from "../utils/adMessages.js";
import "dotenv/config";
import handleArrErr from "../helpers/handleAccErr.js";

// Your proxy config from IPRoyal
const proxyHost = process.env.proxyHost || "geo.iproyal.com";
const proxyPort = parseInt(process.env.proxyPort, 10) || 12321;
const proxyUsername = process.env.proxyUsername;
const proxyPassword = process.env.proxyPassword;

// Global tracking for last picked message indices per phone number
const lastPickedMessageIndices = new Map();

// Global control variables for messaging system
let messagingActive = false;
let activeClients = new Map(); // Store active clients for cleanup
let messagingController = null; // AbortController for stopping messaging

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

async function runMessagingProcess(params) {
  try {
    messagingActive = true;
    messagingController = new AbortController();

    console.log("🚀 Starting messaging system...");

    while (messagingActive && !messagingController.signal.aborted) {
      try {
        // Fetch all numbers from database
        const numbers = await Number.find({});

        if (numbers.length === 0) {
          console.log("No accounts found in database. Retrying in 10s...");
          await sleep(10000);
          continue;
        }

        console.log(`Starting messaging for ${numbers.length} accounts`);

        // Start messaging for each account in parallel
        const messagingPromises = numbers.map(async (numberDoc) => {
          if (!messagingActive || messagingController.signal.aborted) return;
          return startAccountMessaging(numberDoc);
        });

        // Wait for all messaging processes to complete (they run indefinitely)
        await Promise.allSettled(messagingPromises);
      } catch (error) {
        console.error("Error in startMessaging:", error);
        if (messagingActive) {
          await sleep(10000);
        }
      }
    }

    console.log("🔴 Messaging system stopped");
    return "Messaging stopped successfully✅\nTo start again, click👉 Start Messages✅"; //Will only get here when messagingActive var is set to false by bot handler
  } catch (error) {
    console.error("Failed to start messaging:", error);
    messagingActive = false;
    return `Failed to start messaging: ${error.message}`;
  }
}

const startMessaging = async () => {
  if (messagingActive) {
    console.log("Messaging is already active!");
    return "Messaging is already active✅\nTo stop sending messages click👉 Stop Messages🚫";
  }

  runMessagingProcess();
  return "Messages started successfully✅";
};

const stopMessaging = async () => {
  if (!messagingActive) {
    console.log("Messaging is not currently active!");
    return "Messaging is already stopped✅\nTo start sending messages click👉 Start Messages✅";
  }

  try {
    console.log("🛑 Stopping messaging system...");

    // Set flag to stop messaging loops
    messagingActive = false;

    // Abort any ongoing operations
    if (messagingController) {
      messagingController.abort();
    }

    // Disconnect all active clients
    const disconnectPromises = Array.from(activeClients.values()).map(
      async (client) => {
        try {
          if (client && client.connected) {
            await client.disconnect();
            console.log("✅ Client disconnected");
          }
        } catch (error) {
          console.error("Error disconnecting client:", error);
        }
      }
    );

    await Promise.allSettled(disconnectPromises);

    // Clear active clients map
    activeClients.clear();

    console.log("✅ All clients disconnected. Messaging system stopped.");
    return "Messaging stopped successfully✅\nTo start again, click👉 Start Messages✅";
  } catch (error) {
    console.error("Error stopping messaging:", error);
    return `Error stopping messaging: ${error.message}`;
  }
};

// Telegraf Bot Command Handlers
const setupBotCommands = (bot) => {
  // Start messaging command
  bot.action("startmsg", async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const numbers = await Number.find();
      if (numbers.length == 0) {
        return await ctx.reply(
          "No numbers in the bot. Login a number to start messaging✅"
        );
      }
      console.log(
        `📱 Start messaging command received from user: ${ctx.from.id}`
      );

      const result = await startMessaging();

      await ctx.reply(result);
    } catch (error) {
      console.error("Error in startmessaging command:", error);
      // await ctx.reply("❌ Error starting messages.");
    }
  });

  // Stop messaging command
  bot.action("stopmsg", async (ctx) => {
    try {
      await ctx.answerCbQuery();

      console.log(
        `📱 Stop messaging command received from user: ${ctx.from.id}`
      );

      const result = await stopMessaging();

      await ctx.reply(result);
    } catch (error) {
      console.error("Error in stopmessaging command:", error);
      await ctx.reply("❌ Error stopping messages");
    }
  });

  // Status command to check messaging state
  bot.action("status", async (ctx) => {
    try {
      const status = messagingActive ? "ACTIVE" : "INACTIVE";
      const clientCount = activeClients.size;
      const statusMessage = `📊 Messaging Status: ${status}\n🔗 Numbers sending messages: ${clientCount}`;

      await ctx.reply(statusMessage);
    } catch (error) {
      console.error("Error in messagingstatus command:", error);
      await ctx.reply("❌ An error occurred while checking messaging status.");
    }
  });
};

const startAccountMessaging = async (numberDoc) => {
  let client = null;

  try {
    // Check if messaging is still active
    if (!messagingActive || messagingController?.signal.aborted) {
      return;
    }

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
        // 🔒 Proxy settings
        // proxy: {
        //   ip: proxyHost,
        //   port: proxyPort,
        //   socksType: 5,
        //   username: proxyUsername,
        //   password: proxyPassword,
        // },
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
        // 🔒 Proxy settings
        // proxy: {
        //   ip: proxyHost,
        //   port: proxyPort,
        //   socksType: 5,
        //   username: proxyUsername,
        //   password: proxyPassword,
        // },
      }
    );

    await client.connect();
    console.log(`Connected account: ${numberDoc.phone}`);

    // Suppress non-critical timeout errors from update loop
    process.on("unhandledRejection", (reason, promise) => {
      if (
        reason?.message === "TIMEOUT" &&
        reason?.stack?.includes("updates.js")
      ) {
        // console.log(`[${numberDoc.phone}] Background update timeout (ignored)`);
        return; // Suppress
      }
      // Log other unhandled rejections
      console.error("Unhandled Rejection:", reason);
    });

    // Store active client for cleanup
    activeClients.set(numberDoc.phone, client);

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

    // Remove from active clients
    activeClients.delete(numberDoc.phone);
  }
};

// Enhanced getAccountGroups function
const getAccountGroups = async (client, phone) => {
  try {
    const dialogs = await client.getDialogs({});
    const validGroups = [];

    console.log(
      `[${phone}] Validating ${dialogs.length} dialogs for group access...`
    );

    for (const dialog of dialogs) {
      if (dialog.isGroup || dialog.isChannel) {
        try {
          // Quick permission test - try to read 1 message
          await client.getMessages(dialog.id, { limit: 1 });
          validGroups.push({
            id: dialog.id,
            title: dialog.title,
            entity: dialog.entity,
            accessHash: dialog.entity.accessHash,
            username: dialog.entity.username || null,
            isChannel: dialog.isChannel,
            isGroup: dialog.isGroup,
          });
        } catch (error) {
          console.log(
            `[${phone}] Skipping invalid group: ${dialog.title} (${error.message})`
          );
        }

        // Small delay to avoid rate limits during validation
        await sleep(100);
      }
    }

    console.log(
      `[${phone}] Found ${validGroups.length} accessible groups out of ${
        dialogs.filter((d) => d.isGroup || d.isChannel).length
      } total groups`
    );
    return validGroups;
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

      // Simulate typing activity (very human-like behavior)
      async () => {
        const randomGroup = groups[Math.floor(Math.random() * groups.length)];
        try {
          // Start typing indicator
          await client.invoke(
            new Api.messages.SetTyping({
              peer: randomGroup.entity || randomGroup.id,
              action: new Api.SendMessageTypingAction({}),
            })
          );

          // Keep typing for realistic duration (2-8 seconds)
          const typingDuration = 2000 + Math.random() * 6000;
          await sleep(typingDuration);

          // Stop typing by sending cancel action
          await client.invoke(
            new Api.messages.SetTyping({
              peer: randomGroup.entity || randomGroup.id,
              action: new Api.SendMessageCancelAction({}),
            })
          );

          console.log(
            `[${phone}] ⌨️  Simulated typing for ${Math.round(
              typingDuration / 1000
            )}s in: ${randomGroup.title}`
          );
        } catch (typingError) {
          // Fallback: just simulate thinking time without API calls
          const thinkingTime = 1000 + Math.random() * 3000;
          await sleep(thinkingTime);
          console.log(
            `[${phone}] 💭 Simulated thinking time (${Math.round(
              thinkingTime / 1000
            )}s) - typing API failed`
          );
        }
      },

      // Simulate checking message history (scroll behavior)
      async () => {
        const randomGroup = groups[Math.floor(Math.random() * groups.length)];
        // Get older messages to simulate scrolling back
        const offsetId = Math.floor(Math.random() * 100) + 50; // Random offset
        await client.getMessages(randomGroup.id, {
          limit: Math.floor(Math.random() * 3) + 1,
          offsetId: offsetId,
        });
        console.log(
          `[${phone}] 📜 Simulated scrolling through history in: ${randomGroup.title}`
        );
      },

      // Simulate brief online status update
      async () => {
        try {
          await client.invoke(
            new Api.account.UpdateStatus({
              offline: false,
            })
          );
          console.log(`[${phone}] 🟢 Updated online status`);
        } catch (statusError) {
          console.log(
            `[${phone}] 🟡 Online status update failed (non-critical)`
          );
        }
      },

      // Simulate checking a random chat (switching between chats)
      async () => {
        if (groups.length > 1) {
          const randomGroup1 =
            groups[Math.floor(Math.random() * groups.length)];
          const randomGroup2 =
            groups[Math.floor(Math.random() * groups.length)];

          // Check first chat
          await client.getMessages(randomGroup1.id, { limit: 1 });
          await sleep(500 + Math.random() * 1500); // Brief pause

          // Switch to second chat
          await client.getMessages(randomGroup2.id, { limit: 1 });

          console.log(
            `[${phone}] 🔄 Simulated switching between chats: ${randomGroup1.title} → ${randomGroup2.title}`
          );
        }
      },
    ];

    // Pick random activity with weighted probability (typing is more common)
    let selectedActivity;
    const random = Math.random();

    if (random < 0.3) {
      // 30% chance of typing simulation (most human-like)
      selectedActivity = activities[3]; // typing activity
    } else if (random < 0.6) {
      // 30% chance of reading messages
      selectedActivity = activities[0]; // reading activity
    } else {
      // 40% chance of other activities
      const otherActivities = [
        activities[1],
        activities[2],
        activities[4],
        activities[5],
        activities[6],
      ];
      selectedActivity =
        otherActivities[Math.floor(Math.random() * otherActivities.length)];
    }

    await selectedActivity();
  } catch (error) {
    handleArrErr(error, phone, true);
    // Silently ignore simulation errors - they're not critical
    console.log(
      `[${phone}] Activity simulation failed (non-critical): ${error.message}`
    );
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

// Enhanced messagingLoop with better group refresh logic
const messagingLoop = async (client, numberDoc, groups) => {
  const phone = numberDoc.phone;
  const groupLastSent = new Map();
  const recentlyUsedGroups = new Set();
  const skippedGroups = new Set(); // Track groups we can't send to
  const MAX_RECENT_GROUPS = Math.min(5, Math.floor(groups.length / 3));

  let messagesSent = 0;
  let cycleCount = 0;
  let consecutiveFailures = 0; // Track consecutive failures
  let lastGroupRefresh = Date.now();

  console.log(`[${phone}] Starting messaging for ${groups.length} groups`);

  while (messagingActive && !messagingController?.signal.aborted) {
    const GROUP_MESSAGE_LIMIT = (10 + Math.random() * 10) * 1000; // 10-20s random
    const MIN_SEND_INTERVAL = (3 + Math.random() * 2) * 1000; // 3-5s random

    try {
      if (!messagingActive || messagingController?.signal.aborted) {
        console.log(`[${phone}] Messaging stopped, exiting loop`);
        break;
      }

      // Refresh groups if too many consecutive failures or it's been too long
      const timeSinceRefresh = Date.now() - lastGroupRefresh;
      const shouldRefreshGroups =
        consecutiveFailures >= 20 || // Increased threshold since permission errors don't count
        timeSinceRefresh > 30 * 60 * 1000 || // 30 minutes since last refresh
        (messagesSent > 0 && messagesSent % 50 === 0); // Every 50 messages

      if (shouldRefreshGroups) {
        console.log(
          `[${phone}] 🔄 Refreshing groups (failures: ${consecutiveFailures}, time: ${Math.round(
            timeSinceRefresh / 60000
          )}min)`
        );
        try {
          const updatedGroups = await getAccountGroups(client, phone);
          if (updatedGroups.length > 0) {
            groups = updatedGroups;
            lastGroupRefresh = Date.now();
            consecutiveFailures = 0;
            skippedGroups.clear(); // Reset skipped groups on refresh
            console.log(
              `[${phone}] ✅ Groups refreshed: ${groups.length} groups`
            );
          }
        } catch (refreshError) {
          console.error(`[${phone}] Failed to refresh groups:`, refreshError);
        }
      }

      if (groups.length === 0) {
        console.log(`[${phone}] No groups available, retrying in 30s...`);
        await sleep(30000);
        continue;
      }

      // Find available groups (excluding skipped ones)
      const now = Date.now();
      const availableGroups = [];

      for (const group of groups) {
        // Skip groups we know we can't send to
        if (skippedGroups.has(group.id)) {
          continue;
        }

        const lastSent = groupLastSent.get(group.id) || 0;
        const timeSinceLastSent = now - lastSent;

        if (timeSinceLastSent >= GROUP_MESSAGE_LIMIT) {
          availableGroups.push({
            ...group,
            timeSinceLastSent,
          });
        }
      }

      // Check if all accessible groups are skipped
      if (skippedGroups.size >= groups.length) {
        console.log(
          `[${phone}] ⚠️ All groups are inaccessible. Refreshing in 5 minutes...`
        );
        await sleep(5 * 60 * 1000);
        skippedGroups.clear();
        continue;
      }

      if (availableGroups.length === 0) {
        let shortestWait = Infinity;
        let nextAvailableGroup = null;

        for (const group of groups) {
          if (skippedGroups.has(group.id)) continue;

          const lastSent = groupLastSent.get(group.id) || 0;
          const waitTime = GROUP_MESSAGE_LIMIT - (now - lastSent);

          if (waitTime > 0 && waitTime < shortestWait) {
            shortestWait = waitTime;
            nextAvailableGroup = group;
          }
        }

        if (shortestWait !== Infinity && shortestWait > 0) {
          console.log(
            `[${phone}] All groups in cooldown. Next: ${
              nextAvailableGroup?.title
            } in ${Math.ceil(shortestWait / 1000)}s`
          );
          await sleep(shortestWait + 500);
          continue;
        }
      }

      // Smart group selection
      const selectSmartGroup = (availableGroups) => {
        const freshGroups = availableGroups.filter(
          (group) => !recentlyUsedGroups.has(group.id)
        );
        const groupsToChooseFrom =
          freshGroups.length > 0 ? freshGroups : availableGroups;
        return groupsToChooseFrom[
          Math.floor(Math.random() * groupsToChooseFrom.length)
        ];
      };

      const selectedGroup = selectSmartGroup(availableGroups);
      const randomMessage = getMessage(numberDoc);

      console.log(
        `[${phone}] Attempting send to: ${selectedGroup.title} (${
          availableGroups.length
        }/${groups.length - skippedGroups.size} available)`
      );

      // Send message with enhanced error handling
      const sendResult = await sendMessageToGroup(
        client,
        selectedGroup,
        randomMessage,
        phone
      );

      if (sendResult.success) {
        groupLastSent.set(selectedGroup.id, now);
        messagesSent++;
        consecutiveFailures = 0; // Reset failure counter on success

        // Update recently used groups tracking
        recentlyUsedGroups.add(selectedGroup.id);
        if (recentlyUsedGroups.size > MAX_RECENT_GROUPS) {
          const groupsArray = Array.from(recentlyUsedGroups);
          recentlyUsedGroups.delete(groupsArray[0]);
        }

        console.log(
          `[${phone}] ✅ Message ${messagesSent} sent to ${selectedGroup.title}`
        );
      } else {
        // Only count actual failures, not permission issues
        if (!sendResult.skipFailureTracking) {
          consecutiveFailures++;
        }

        if (sendResult.permissionDenied) {
          // Permanently skip this group
          skippedGroups.add(selectedGroup.id);
          console.log(
            `[${phone}] 🚫 Skipping group permanently: ${selectedGroup.title} (${skippedGroups.size}/${groups.length} skipped)`
          );
        } else if (sendResult.waitTime) {
          const extendedCooldown = now + sendResult.waitTime * 1000;
          groupLastSent.set(
            selectedGroup.id,
            extendedCooldown - GROUP_MESSAGE_LIMIT
          );
          console.log(
            `[${phone}] ⏱️ Extended cooldown for ${selectedGroup.title}: ${sendResult.waitTime}s`
          );
        } else if (sendResult.peerInvalid) {
          console.log(
            `[${phone}] 🔄 Peer invalid for ${selectedGroup.title}, will refresh groups soon`
          );
        }
      }

      // Human activity simulation (30% chance)
      if (Math.random() < 0.3) {
        await simulateHumanActivity(client, groups, phone);
      }

      await sleep(MIN_SEND_INTERVAL);

      // Random human-like breaks every few messages
      const BREAK_FREQUENCY = 5 + Math.floor(Math.random() * 10); // 5-15 messages
      if (messagesSent % BREAK_FREQUENCY === 0 && messagesSent > 0) {
        const BREAK_DURATION = (10 + Math.random() * 10) * 1000; // 10-20s break
        console.log(
          `[${phone}] 💤 Taking human-like break for ${Math.ceil(
            BREAK_DURATION / 1000
          )} seconds...`
        );
        await sleep(BREAK_DURATION);
      }
    } catch (error) {
      consecutiveFailures++;
      handleArrErr(error, numberDoc);
      console.error(`[${phone}] Error in messaging loop:`, error);
      await sleep(30 * 1000);
    }
  }
};

// Enhanced sendMessageToGroup with multiple fallback methods and proper error categorization
const sendMessageToGroup = async (client, group, message, phone) => {
  const sendAttempts = [];

  try {
    // Method 1: Try with stored entity first
    if (group.entity) {
      try {
        await client.sendMessage(group.entity, { message: message });
        console.log(`[${phone}] ✅ Sent via stored entity to: ${group.title}`);
        return { success: true };
      } catch (entityError) {
        sendAttempts.push(`Entity method failed: ${entityError.message}`);
      }
    }

    // Method 2: Try with username if available
    if (group.username) {
      try {
        await client.sendMessage(group.username, { message: message });
        console.log(`[${phone}] ✅ Sent via username to: ${group.title}`);
        return { success: true };
      } catch (usernameError) {
        sendAttempts.push(`Username method failed: ${usernameError.message}`);
      }
    }

    // Method 3: Try to resolve entity fresh
    try {
      const freshEntity = await client.getEntity(group.id);
      await client.sendMessage(freshEntity, { message: message });
      console.log(`[${phone}] ✅ Sent via fresh entity to: ${group.title}`);
      return { success: true };
    } catch (freshEntityError) {
      sendAttempts.push(
        `Fresh entity method failed: ${freshEntityError.message}`
      );
    }

    // Method 4: Try with BigInt conversion (sometimes needed for large IDs)
    try {
      const bigIntId = BigInt(group.id);
      const resolvedEntity = await client.getEntity(bigIntId);
      await client.sendMessage(resolvedEntity, { message: message });
      console.log(`[${phone}] ✅ Sent via BigInt ID to: ${group.title}`);
      return { success: true };
    } catch (bigIntError) {
      sendAttempts.push(`BigInt method failed: ${bigIntError.message}`);
    }

    // If all methods failed, log the attempts
    console.error(`[${phone}] ❌ All send methods failed for ${group.title}:`);
    sendAttempts.forEach((attempt, index) => {
      console.error(`  ${index + 1}. ${attempt}`);
    });

    // Analyze the errors to determine the type of failure
    const errorMessages = sendAttempts.join(" ").toUpperCase();

    // CRITICAL: Check for wait time requirement FIRST
    if (
      errorMessages.includes("WAIT OF") &&
      errorMessages.includes("SECONDS")
    ) {
      const match = sendAttempts[0].match(/wait of (\d+) seconds/i);
      const waitTime = match ? parseInt(match[1]) : 60;
      console.log(
        `[${phone}] ⏱️ Slowmode: ${group.title} requires ${waitTime}s wait`
      );
      return { success: false, waitTime: waitTime, skipFailureTracking: true };
    }

    // Check for permission errors (NOT session errors)
    if (
      errorMessages.includes("CHAT_WRITE_FORBIDDEN") ||
      errorMessages.includes("CHAT_ADMIN_REQUIRED") ||
      errorMessages.includes("USER_BANNED_IN_CHANNEL")
    ) {
      console.log(
        `[${phone}] 🚫 No permission in: ${group.title} (will skip this group)`
      );
      return {
        success: false,
        permissionDenied: true,
        skipFailureTracking: true,
      };
    }

    // Check for actual peer/session errors
    if (
      errorMessages.includes("PEER_ID_INVALID") ||
      errorMessages.includes("CHANNEL_INVALID") ||
      errorMessages.includes("CHAT_ID_INVALID")
    ) {
      console.log(`[${phone}] ⚠️ Invalid peer: ${group.title}`);
      return { success: false, peerInvalid: true };
    }

    // Default: unknown failure
    return { success: false };
  } catch (error) {
    console.error(
      `[${phone}] ❌ Unexpected error sending to ${group.title}: ${error.message}`
    );

    // Check for specific error types
    const msg = error.message?.toUpperCase() || "";

    // Handle wait time
    if (msg.includes("WAIT OF") && msg.includes("SECONDS")) {
      const match = error.message.match(/wait of (\d+) seconds/i);
      const waitTime = match ? parseInt(match[1]) : 60;
      return { success: false, waitTime: waitTime, skipFailureTracking: true };
    }

    // Handle permission errors
    if (
      msg.includes("CHAT_WRITE_FORBIDDEN") ||
      msg.includes("CHAT_ADMIN_REQUIRED") ||
      msg.includes("USER_BANNED_IN_CHANNEL")
    ) {
      return {
        success: false,
        permissionDenied: true,
        skipFailureTracking: true,
      };
    }

    // Handle peer errors
    if (msg.includes("PEER_ID_INVALID")) {
      return { success: false, peerInvalid: true };
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
process.on("SIGINT", async () => {
  console.log("\nReceived SIGINT, shutting down gracefully...");
  await stopMessaging();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nReceived SIGTERM, shutting down gracefully...");
  await stopMessaging();
  process.exit(0);
});

// Export functions for use in other modules
export { startMessaging, stopMessaging, setupBotCommands };
export default startMessaging;
