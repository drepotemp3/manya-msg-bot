import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram/tl/index.js";
import "dotenv/config";
import { Telegraf } from "telegraf";
import connectDb from "./db/connectDb.js";
import Number  from "./models/Number.js";
import { computeCheck } from "telegram/Password.js";
import express from "express";
import startMessaging from "./services/startMessaging.js";
import User from "./models/User.js";
import path from "path";
import { fork } from "child_process";

let messagingProcess = null;

export const startMessagingProcess = (ctx) => {
  if (messagingProcess && !messagingProcess.killed) {
    ctx.reply("Messaging is already sending, don't worry.\n\nIf you want to stop messages use 👉 /stop_msg");
    return;
  }

  messagingProcess = fork(
    path.resolve("./services/startMessaging.js"),
    ["runMessaging"]
  );

  ctx.reply("Messages started successfully✅\nThe logged in accounts will start sending messages shortly.");
  console.log("Messaging process started with PID:", messagingProcess.pid);

  messagingProcess.on("exit", (code, signal) => {
    ctx.reply("Messages stopped successfully👍\nTo start messages again, send 👉 /start_msg");
    console.log(`Messaging process exited. Code: ${code}, Signal: ${signal}`);
    messagingProcess = null;
  });
};

export const stopMessagingProcess = (ctx) => {
  if (!messagingProcess || messagingProcess.killed) {
    ctx.reply("Messages are already stopped.\n\nIf you want to start messages use 👉 /start_msg");
    return;
  }

  messagingProcess.kill("SIGTERM");
  console.log("Messaging process killed");
};


const bot = new Telegraf(process.env.BOT_TOKEN);
global.bot = bot;
global.users = []
const app = express();

let ct = 0;
app.get("/dev", async (req, res) => {
  ++ct;
  res.send(`Hello world> ${ct}`);
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Listening on port ${port}!`);
});

const handleError = async (error, ctx) => {
  await ctx.reply("Bot error, contact dev for checkup.");
  await ctx.reply("Bot mein error hai, dev se sampark kare checkup ke liye.");
  console.log(error);
};

bot.start(async (ctx) => {
  try {
    const id = ctx.from.id
    //Create user (if new)
    if(!global.users.includes(id)){
      await User.create({chatId:id})
      global.users = [id, ...global.users]
    }

    let name = ctx.from.username ? ctx.from.username : ctx.from.first_name;
    name = name ? name : ctx.from.last_name;
    name = name ? name : "User";

    await ctx.reply(
      `Hi, ${name}👋\n
Click any of the buttons below to use me👇`,
      {
        reply_markup: {
          inline_keyboard: [
             [
              {
                text: "Start messages✅",
                callback_data: "start_msg",
              },
            ],
             [
              {
                text: "Stop messages🚫",
                callback_data: "stop_msg",
              },
            ],
            [
              {
                text: "See all accounts in the bot",
                callback_data: "accounts",
              },
            ],
            [{ text: "Login an account in bot", callback_data: "login" }],
          ],
        },
      }
    );
  } catch (error) {
    handleError(error, ctx);
  }
});

bot.command("start_msg", (ctx)=>startMessagingProcess(ctx))
bot.command("stop_msg", (ctx)=>stopMessagingProcess(ctx))
bot.action("start_msg", (ctx)=>startMessagingProcess(ctx))
bot.action("stop_msg", (ctx)=>stopMessagingProcess(ctx))

bot.action("login", async (ctx) => {
  try {
    await ctx.deleteMessage();
    global.takingNumber = true;

    await ctx.reply(
      "Send me the number of the account, with country code.\nExample👉 +91098765432"
    );

    await ctx.reply(
      "Account ka number bhejo, country code ke saath.\nExample👉 +91098765432"
    );
  } catch (error) {
    handleError(error, ctx);
  }
});
bot.command("login", async (ctx) => {
  try {
    global.takingNumber = true;

    await ctx.reply(
      "Send me the number of the account, with country code.\nExample👉 +91098765432"
    );

    await ctx.reply(
      "Account ka number bhejo, country code ke saath.\nExample👉 +91098765432"
    );
  } catch (error) {
    handleError(error, ctx);
  }
});
bot.action("accounts", async (ctx) => {
  try {
    await ctx.deleteMessage();
    const allAcc = await Number.find().select("username phone");
    if (allAcc.length == 0) {
      await ctx.reply(
        "No accounts in bot. Please login to add accounts👉 /login"
      );
      return await ctx.reply(
        "Bot mein koi accounts nahi hain. Kripya login karke accounts add karein 👉 /login"
      );
    }

    let accText = ``;
    allAcc.map((e) => (accText += `${e.username}\n`));

    const englishReply = `
The following accounts are in the bot and sending messages to all their groups👇

${accText}

To login more accounts, send 👉 /login`;
    await ctx.reply(englishReply);
    const hindiReply = `
Nimnalikhit accounts bot mein hain aur apne sare groups mein messages bhej rahe hain👇

${accText}

Aur accounts login karne ke liye bhejein 👉 /login`;
    await ctx.reply(hindiReply);
  } catch (error) {
    handleError(error);
  }
});

let thisClient = null;

bot.on("text", async (ctx) => {
  const entry = ctx.message.text;
  try {
    //Number entry for login
    if (global.takingNumber) {
      const phone = entry;
      global.phoneToLogin = phone;
      const exists = await Number.findOne({ phone });

      //Reject duplicate logins
      if (exists) {
        await ctx.reply(
          "That number is already in the bot.\nSend a different number to login.",
          { reply_to_message_id: ctx.message.message_id }
        );

        await ctx.reply(
          "Ye number pehle se bot mein hai.\nLogin ke liye dusra number bhejo.",
          { reply_to_message_id: ctx.message.message_id }
        );
        return;
      }

      await ctx.reply("Sending code, please wait...🟡🟡🟡");
      await ctx.reply("Code bhej rahe hain, wait karo...🟡🟡🟡");

      // Create client with better configuration
      thisClient = new TelegramClient(
        new StringSession(""),
        parseInt(process.env.API_ID),
        process.env.API_HASH,
        {
          useWSS: false,
          autoReconnect: true, // Enable auto reconnect
          timeout: 30000, // Increase timeout to 30 seconds
          requestRetries: 3, // Increase retry attempts
          connectionRetries: 5, // Add connection retries
          retryDelay: 1000, // Add delay between retries
          maxConcurrentDownloads: 1,
        }
      );

      try {
        console.log(`Attempting to connect for phone: ${phone}`);
        await thisClient.connect();
        console.log("Client connected successfully");

        // Send code with better error handling
        const result = await sendCodeWithRetry(thisClient, phone);

        if (result.success) {
          global.hashToLogin = result.phoneCodeHash;

          await ctx.reply(
            `Code sent for *${phone}.* Check the telegram account and send it to me.\n\nIf the account has a password, send it together like this👉 {code}, {password}\n\nFor example👉 *12356, password*`,
            { parse_mode: "Markdown" }
          );

          await ctx.reply(
            `*${phone}* ke liye code bhej diya. Telegram account check karo aur code yahan bhejo.\n\nAgar account mein password hai, to aise bhejo👉 {code}, {password}\n\nJaise👉 *12356, password*`,
            { parse_mode: "Markdown" }
          );

          global.takingNumber = false;
          global.takingCode = true;
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        console.error("Error in login process:", error);

        await ctx.reply(
          `Error❌\nCouldn't request otp for *${phone}*\nReason: ${error.message}`
        );

        await ctx.reply(
          `Error❌\n*${phone}* ke liye otp nahi bhej sake\nWajah: ${error.message}`
        );

        // Clean up on error
        if (thisClient) {
          try {
            await thisClient.disconnect();
          } catch (disconnectError) {
            console.error("Error disconnecting client:", disconnectError);
          }
        }

        // Reset global state
        global.phoneToLogin = null;
        global.hashToLogin = null;
        global.takingNumber = false;
        global.takingCode = false;
      }
    } else if (global.takingCode) {
      const split = entry.split(",");
      const code = split[0]?.trim();
      const password = split[1]?.trim();

      if (!code) {
        await ctx.reply("Please provide a valid code.");
        await ctx.reply("Sahi code bhejo.");
        return;
      }

      try {
        // Reconnect client for sign in
        if (!thisClient || !thisClient.connected) {
          thisClient = new TelegramClient(
            new StringSession(""),
            parseInt(process.env.API_ID),
            process.env.API_HASH,
            {
              useWSS: false,
              autoReconnect: true,
              timeout: 30000,
              requestRetries: 3,
              connectionRetries: 5,
              retryDelay: 1000,
            }
          );
          await thisClient.connect();
        }

        let result;
        try {
          // Attempt to sign in using the code
          result = await thisClient.invoke(
            new Api.auth.SignIn({
              phoneNumber: `${global.phoneToLogin}`,
              phoneCodeHash: global.hashToLogin,
              phoneCode: code,
            })
          );

          await handleSuccessfulLogin(result, ctx, password);
        } catch (error) {
          if (
            error.code === 401 &&
            error.errorMessage === "SESSION_PASSWORD_NEEDED"
          ) {
            if (!password) {
              await ctx.reply(
                "This account requires a password. Please send the code and password like this: {code}, {password}"
              );

              await ctx.reply(
                "Is account mein password chahiye. Code aur password aise bhejo: {code}, {password}"
              );
              return;
            }

            console.log("Password required, attempting 2FA login...");

            // Handle 2FA authentication
            const passwordInfo = await thisClient.invoke(
              new Api.account.GetPassword()
            );
            const passwordHashResult = await computeCheck(
              passwordInfo,
              password
            );

            result = await thisClient.invoke(
              new Api.auth.CheckPassword({
                password: passwordHashResult,
              })
            );

            await handleSuccessfulLogin(result, ctx, password);
          } else {
            throw error;
          }
        }
      } catch (error) {
        console.error("Error signing in:", error);

        await ctx.reply(
          `Error❌\nCouldn't complete login for ${global.phoneToLogin}\nReason: ${error.message}`
        );

        await ctx.reply(
          `Error❌\n${global.phoneToLogin} ka login complete nahi ho saka\nWajah: ${error.message}`
        );

        global.takingCode = null;
        
        // Clean up on error
        await cleanupClient();
        resetGlobalState();
      }
    }
  } catch (error) {
    console.error("Unexpected error in text handler:", error);
    handleError(error, ctx);
  }
});

bot.telegram.setMyCommands([
  { command: "/start", description: "Start Manya bot" },
  { command: "/set_message", description: "Set message for an account" },
  { command: "/start_message", description: "Begin to send messages" },
  { command: "/stop_messages", description: "Stop to send messages" },

]);

// Helper function to send code with retry logic and DC migration handling
async function sendCodeWithRetry(client, phone, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt} to send code for ${phone}`);

      const { phoneCodeHash } = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber: `${phone}`,
          apiId: parseInt(process.env.API_ID),
          apiHash: `${process.env.API_HASH}`,
          settings: new Api.CodeSettings({
            allowFlashcall: true,
            currentNumber: true,
            allowAppHash: true,
            allowMissedCall: true,
            logoutTokens: [Buffer.from("arbitrary data here")],
          }),
        })
      );

      console.log(`Code sent successfully for ${phone}`);
      return { success: true, phoneCodeHash };
    } catch (error) {
      console.log(`Attempt ${attempt} failed:`, error.message);

      // Handle PHONE_MIGRATE error
      if (error.message && error.message.startsWith("PHONE_MIGRATE_")) {
        const dcId = parseInt(error.message.split("_").pop(), 10);
        console.log(`Phone requires DC ${dcId}, migrating...`);

        try {
          // Disconnect and reconnect to correct DC
          await client.disconnect();
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds

          // Create new client with correct DC
          const newClient = new TelegramClient(
            new StringSession(""),
            parseInt(process.env.API_ID),
            process.env.API_HASH,
            {
              useWSS: false,
              autoReconnect: true,
              timeout: 30000,
              requestRetries: 3,
              connectionRetries: 5,
              retryDelay: 1000,
              initialServerAddress: getDCAddress(dcId), // Set correct DC
            }
          );

          await newClient.connect();

          // Replace global client
          thisClient = newClient;

          // Retry with new client
          const { phoneCodeHash } = await newClient.invoke(
            new Api.auth.SendCode({
              phoneNumber: `${phone}`,
              apiId: parseInt(process.env.API_ID),
              apiHash: `${process.env.API_HASH}`,
              settings: new Api.CodeSettings({
                allowFlashcall: true,
                currentNumber: true,
                allowAppHash: true,
                allowMissedCall: true,
                logoutTokens: [Buffer.from("arbitrary data here")],
              }),
            })
          );

          console.log(`Code sent successfully after DC migration for ${phone}`);
          return { success: true, phoneCodeHash };
        } catch (migrationError) {
          console.error(`Migration to DC ${dcId} failed:`, migrationError);
          if (attempt === maxRetries) {
            return {
              success: false,
              error: `Failed to migrate to DC ${dcId}: ${migrationError.message}`,
            };
          }
        }
      } else if (attempt === maxRetries) {
        return { success: false, error: error.message };
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }

  return { success: false, error: "Max retries exceeded" };
}

// Helper function to get DC addresses
function getDCAddress(dcId) {
  const dcMap = {
    1: "149.154.175.53",
    2: "149.154.167.51",
    3: "149.154.175.100",
    4: "149.154.167.91",
    5: "91.108.56.133",
  };
  return dcMap[dcId] || null;
}

// Helper function to handle successful login
async function handleSuccessfulLogin(result, ctx, password) {
  // Save the session
  const session = thisClient.session.save();
  const me = await thisClient.getMe();
  const username = me.username;

  await Number.create({
    phone: global.phoneToLogin,
    password: password || null,
    session,
    username: "@" + username,
  });

await ctx.reply(
  `Login successful ✅\nNumber: ${global.phoneToLogin}\nUsername: @${username}\n\n@${username} will soon start sending messages to groups 👍`
);

await ctx.reply(
  `Login safal ✅\nNumber: ${global.phoneToLogin}\nUsername: @${username}\n\n@${username} jald hi groups mein messages bhejna shuru karega 👍`
);


  global.takingCode = null;
  resetGlobalState();
  await cleanupClient();
  await startMessaging()
}

// Helper function to cleanup client
async function cleanupClient() {
  if (thisClient) {
    try {
      await thisClient.disconnect();
      console.log("Client disconnected successfully");
    } catch (error) {
      console.error("Error disconnecting client:", error);
    }
  }
}

// Helper function to reset global state
function resetGlobalState() {
  global.phoneToLogin = null;
  global.hashToLogin = null;
  global.takingCode = false;
  global.takingNumber = false;
}

connectDb();

// import  {ProxyAgent}  from 'undici'

// const url = 'https://ipv4.icanhazip.com';
// const client = new ProxyAgent(
// 	'http://cTkMil8sVustS4cI:L52fkumhX9ZaLPTC_country-in@geo.iproyal.com:12321'
// );
// const proxyTest = async () => {
// 	try {
// 		const response = await fetch(url, {
// 			dispatcher: client,
// 		});

// 		const data = await response.text();
// 		console.log(data);
// 	} catch (error) {
// 		console.error(error);
// 	}
// };

// proxyTest();



// (async function() {

//     // Replace with your actual session string
//     const sessionString = '1BQANOTEuMTA4LjU2LjEyNQG7W3fA0w+IMdDwxgks7NQkQtL87jw6tiwnJ0ydn6o+DBIfb8i/JlHF9aZFJ0P8bARantvcbyGhpvFtW02VAyhQGdQKAHj03JGAI2FhuoHrFPnFx/7grbIFf54EC8H83mspGOJoFtk9G5jpg2HGbAanzQyGGzXkdnvz5ukJcv44iEUyrXTWF+ShcESR+EKZmt7A0YD9GVtTjf0Mvgl4AZrnMdUyhOIkcZd/q/bTPgcsNUePPwsTRv4i+p0MShqKkNzuYQfuha90TOCxWg6D3x3tXisQEAPGOLkUhQXHNp5f2gVNJELPrOEWKow4YrBSkTN6LU108i0pTMqKXTfGKvBFwA==';
    
//     // Replace with your API credentials from https://my.telegram.org
//     const apiId = process.env.API_ID;
//     const apiHash = process.env.API_HASH;
    
//     const session = new StringSession(sessionString);
//     const client = new TelegramClient(session, parseInt(apiId), apiHash, {
//         connectionRetries: 5,
//     });
    
//     try {
//         console.log('Connecting to Telegram...');
//         await client.connect();
//         console.log('Connected successfully!');
//         let i =0
//        // Listen for ANY messages - only log content
//         client.addEventHandler(async (update) => {
//             // Check if it's a new message (works for both channels and regular chats)
//             if (update.className === 'UpdateNewMessage' || update.className === 'UpdateNewChannelMessage') {
//                 const message = update.message;
                
//                 // Log ONLY the message content
//                 if (message.message) {
//                   ++i
//                   logStringToFile(message.message)
//                     console.log("done "+i);
//                 }
//             }
//         });
        
//         console.log('Listening for messages... Press Ctrl+C to stop');
        
//         // Keep the process running
//         process.on('SIGINT', async () => {
//             console.log('\nDisconnecting...');
//             await client.disconnect();
//             process.exit(0);
//         });
        
//     } catch (error) {
//         console.error('Error:', error);
//         await client.disconnect();
//     }
// })();