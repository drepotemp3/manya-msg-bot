import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram/tl/index.js";
import input from "input"; // npm install input
import "dotenv/config";
import { Telegraf } from "telegraf";
import connectDb from "./db/connectDb.js";
import { Number } from "./models/Number.js";
import { computeCheck } from "telegram/Password.js";
import generateTextVariants from "./helpers/generateTextVariants.js";

// Replace with your own API_ID and API_HASH from my.telegram.org
const apiId = process.env.API_ID;
const apiHash = process.env.API_HASH;

const bot = new Telegraf(process.env.BOT_TOKEN);
global.bot = bot;

const handleError = async (error, ctx) => {
  await ctx.reply("Bot error, contact dev for checkup.");
  console.log(error);
};

bot.start(async (ctx) => {
  try {
    let name = ctx.from.username ? ctx.from.username : ctx.from.first_name;
    name = name ? name : ctx.from.last_name;
    name = name ? name : "User";
    await ctx.reply(`Welcome, ${name}👋\n
To login accounts, send me this command 👉 /login

To set account message, send me this command 👉 /set_message {username}
For example, to set message for @shubh, send me👉 /set_message @shubh
`);
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
  } catch (error) {
    handleError(error, ctx);
  }
});

bot.command("set_message", async (ctx) => {
  let username = ctx.message.text.split(" ").slice(1).join(" ").trim();
  try {
    if (!username)
      return await ctx.reply(`Username is required.\n
To set account message, send me this command 👉 /set_message {username}
For example, to set message for @shubh, send me👉 /set_message @shubh`);

    username = username.includes("@") ? username : "@" + username;
    global.settingMessage = username;
    await ctx.reply("Send me the new message for " + username);
  } catch (error) {
    handleError(error, ctx);
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
        return await ctx.reply(
          "That number is already in the bot.\nSend a different number to login.",
          { reply_to_message_id: ctx.message.message_id }
        );
      }

      await ctx.reply("Sending code, please wait...🟡🟡🟡");

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
            `Code sent for *${phone}.* Check the telegram account and send it to me.\n\nIf the account has a password, send it together like this👉 {code}, {password}\n\nFor example👉 *12356, myPassword123*`,
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
        return await ctx.reply("Please provide a valid code.");
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
              return await ctx.reply(
                "This account requires a password. Please send the code and password like this: {code}, {password}"
              );
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

        // Clean up on error
        await cleanupClient();
        resetGlobalState();
      }
    } else if (global.takingMessageFor) {
      const message = generateTextVariants(entry)
      try {
        let acc = await Number.findOneAndUpdate(
          { username: global.takingMessageFor },
          { message },
          { new: true }
        );

        if (acc) {
          await ctx.reply(
            `Message saved for ${acc.username}✅\nThey will send it to their groups from now on.`
          );
        } else {
          await ctx.reply("Account not found.\nLogin that account before setting message.");
        }
      } catch (error) {
        console.error("Error saving message:", error);
        await ctx.reply("Error saving message. Please try again.");
      }
      global.takingMessageFor = null;
    } else if (global.settingMessage) {
      const variants = generateTextVariants(entry)
      try {
        await Number.findOneAndUpdate(
          { username: global.settingMessage },
          { message: variants }
        );
        await ctx.reply("Message updated for " + global.settingMessage + "✅"+"\nThey will send it to their groups from now on.");
      } catch (error) {
        console.error("Error updating message:", error);
        await ctx.reply("Error updating message. Please try again.");
      }
      global.settingMessage = null;
    }
  } catch (error) {
    console.error("Unexpected error in text handler:", error);
    handleError(error, ctx);
  }
});

bot.telegram.setMyCommands([
  {command:"/start", description:"Start Manya bot"},
  {command:"/login", description:"Login a telegram account for group messaging"},
  {command:"/set_message", description:"Set message for an account"}
])

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
    `Login successful✅\nNumber: ${global.phoneToLogin}\nUsername: @${username}`
  );

  await ctx.reply(`Send the message for @${username}`);

  global.takingMessageFor = "@" + username;
  resetGlobalState();
  await cleanupClient();
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
// Load your saved session
const stringSession = new StringSession(
  "1BQANOTEuMTA4LjU2LjEzMwG7webranjzoBEi7WxoGj7qYlGQrRv+aXHoyvY1lV00BKq5cWQp1FJNHUpQQHvcBiw30lYoDqXuGzjb0HByWlxwiox+po95rgkNUhTiXvhsBmYcNXiiZw/v9Qkujtatcnq81tCj3g2EU7BJ2jc2ycV5z25vKsdu9nv3/CjEA7RY/VfR9lqso4K218mmbfSuRzyyuRqnG3J5ra7/fO6dRb4emUX6vNWHLHVvBKUojHLsXZ77xFKoQOniM5RfZEIG3pvgPSH18QWj6knME9L1zQ4r2eBFDB8l65hyYZPuOxcoS+djT8APt5Li8FegvGrBX9EftDTwlt7Wz8FIyFTv/aG8fw=="
);

// Groups to send to
const targetGroups = [4879391020, 2189409471, 2498336219, 2377391548];

// Message to send
const messageText = `𝐈 𝐀𝐌 22 𝐘𝐄𝐀𝐑 𝐎𝐋𝐃 𝐅𝐎𝐑 𝐅𝐔𝐍 😍

✅ @sizzling_mehak

✅ @sizzling_mehak

🚩🚩🚩🚩🚩🚩

        
    🇮💥 🇦 🇲  💥 🇳 🇪 🇼  

        🇲 🇴 🇩 🇪 🇱💥 🇭 🇪 🇷 🇪 

   🦋 ❤️‍🔥 ✨❤️‍🔥 🦋

    🚨 👍 𝐁𝐄𝐒𝐓 𝐎𝐅𝐅𝐄𝐑𝐒 𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄  👍🚨

    💦💦   𝐅𝐔𝐋𝐋 𝐒𝐀𝐓𝐈𝐒𝐅𝐀𝐂𝐓𝐈𝐎𝐍  💦💦

🚩🚩🚩🚩 🚩🚩

          🇼 🇮 🇹 🇭 ❣️🇫 🇦 🇨 🇪
  

🇼 🇮 🇹 🇭 🇴 🇺 🇹 ❣️🇫 🇦 🇨 🇪 

💦💦❣️𝑫𝒊*𝒅𝒐 𝑺𝒉𝒐𝒘  🥕        
💦💦❣️ 𝑹𝒐𝒍𝒆𝒑𝒍𝒂𝒚 𝑺𝒉𝒐𝒘 🦋
💦💦❣️ 𝑺𝒒𝒖𝒊𝒓𝒕𝒊𝒏𝒈 𝑺𝒉𝒐𝒘 🥛
💦💦❣️𝑨𝒏𝒂𝒍 𝑺𝒉𝒐𝒘    👌

💦💦❣️ 𝑺𝒂𝒓𝒆𝒆 𝑺𝒉𝒐𝒘 🥻
💦💦❣️ 𝑷𝒆𝒆 𝑺𝒉𝒐𝒘 💦
💦💦❣️ 𝑷𝒆𝒓𝒊𝒐𝒅𝒔 𝑺𝒉𝒐𝒘 
💦💦❣️ 𝑩𝒂𝒕𝒉 𝑺𝒉𝒐𝒘 💦

💦💦❣️ 𝑫𝒂𝒏𝒄𝒆𝒊𝒏𝒈 𝑵𝒖𝒅𝒆 𝑺𝒉𝒐𝒘 💃
💦💦❣️ 𝑶𝒊𝒍 𝑴𝒂𝒔𝒔𝒂𝒈𝒆 𝑺𝒉𝒐𝒘 🍯
💦💦❣️ 𝑽𝒊𝒃𝒓𝒂𝒕𝒐𝒓𝒔 𝑺𝒉𝒐𝒘 🎤
💦💦❣️ 𝑨𝒔𝒔 𝑺𝒉𝒐𝒘  💥

💦💦❣️ 𝑪𝒉𝒐𝒄𝒍𝒂𝒕𝒆 𝑺𝒉𝒐𝒘 🍫
💦💦❣️ 𝒊𝒄𝒆 𝑺𝒉𝒐𝒘  🧊
💦💦❣️ 𝑪𝒖𝒄𝒖𝒎𝒃𝒆𝒓 𝑺𝒉𝒐𝒘 🥒
💦💦❣️ 𝑷𝒐𝒕𝒕𝒚 𝑺𝒉𝒐𝒘. 🍥

💦💦❣️ 𝑺𝒐𝒍𝒐 𝑺𝒉𝒐𝒘  👠
💦💦❣️ 𝑪𝒂𝒎 𝑺𝒉𝒐𝒘  🍾
💦💦❣️ 𝑩𝒖𝒓𝒌𝒉𝒂 𝑺𝒉𝒐𝒘 🥷
💦💦❣️ 𝑯𝒊𝒋𝒂𝒃 𝑺𝒉𝒐𝒘
💦💦❣️ 𝑽𝒐𝒊𝒄𝒆 𝒄𝒂𝒍𝒍  📞

🚨🚩𝐁𝐄𝐒𝐓 𝐎𝐅𝐅𝐄𝐑𝐒 𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋 🚩🚨

💦𝐅𝐔𝐋𝐋 𝐒𝐀𝐓𝐈𝐒𝐅𝐀𝐂𝐓𝐈𝐎𝐍 💦

   𝐃𝐎𝐍'𝐓  𝐀𝐒𝐊  𝐅𝐎𝐑 𝐅𝐑𝐄𝐄 ❌

𝐕𝐞𝐫𝐢𝐟𝐢𝐞𝐝 𝐁𝐲  👉  🔻🚨  🇦 🇩 🇲 🇮 🇳  🚨

🇦 🇻 🇦 🇮 🇱 🇦 🇧 🇱 🇪 
                  🇳 🇴 🇼

✅ ⭐𝔹ℝ𝔸ℕ𝔻𝔼𝔻 ℕ𝔼𝕎 𝔾𝕀ℝ𝕃 ℍ𝔼ℝ𝔼⭐ ✅

          💯✅% 𝗥𝗲𝗮𝗹 

🕊 🔻𝖣𝗆 𝗆𝖾 𝗀𝗎𝗒𝗌--  @sizzling_mehak

🇩 🇲 🔻 @sizzling_mehak`;

// (async () => {
//   console.log("Starting Telegram client...");

//   const client = new TelegramClient(stringSession, apiId, apiHash, {
//     connectionRetries: 5,
//   });

//   // Login
//   await client.start({
//     phoneNumber: async () => await input.text("Enter your phone number: "),
//     password: async () =>
//       await input.text("Enter your 2FA password (if enabled): "),
//     phoneCode: async () => await input.text("Enter the code you received: "),
//     onError: (err) => console.log("Login error:", err),
//   });

//   console.log("✅ Logged in successfully!");

//   // Map group IDs to names for nice logging
//   const dialogs = await client.invoke(
//     new Api.messages.GetDialogs({
//       offsetDate: 0,
//       offsetId: 0,
//       offsetPeer: new Api.InputPeerEmpty(),
//       limit: 200,
//       hash: 0,
//     })
//   );

//   const chatMap = new Map();
//   dialogs.chats.forEach((c) => {
//     chatMap.set(c.id.toString(), c.title || c.username || "Unknown");
//   });

//   // Send message to each group
//   for (const groupId of targetGroups) {
//     try {
//       await client.sendMessage(groupId, { message: messageText });
//       console.log(`✅ Sent to ${chatMap.get(groupId.toString()) || groupId}`);
//     } catch (err) {
//       console.log(
//         `❌ Failed to send to ${chatMap.get(groupId.toString()) || groupId}: ${
//           err.message
//         }`
//       );
//     }

//     // Sleep 5s between sends to avoid flood ban
//     await new Promise((res) => setTimeout(res, 20000));
//   }

//   // LOG CHATS

//   //   const result = await client.invoke(
//   //     new Api.messages.GetDialogs({
//   //       offsetDate: 0,
//   //       offsetId: 0,
//   //       offsetPeer: new Api.InputPeerEmpty(),
//   //       limit: 200,
//   //       hash: 0,
//   //     })
//   //   );

//   //   // Filter only groups
//   //   const groups = result.chats.filter(
//   //     (chat) => chat.className === "Chat" || chat.className === "Channel"
//   //   );

//   //   console.log("\n📌 Groups you belong to:");
//   //   for (const g of groups) {
//   //     console.log(`ID: ${g.id} | Name: ${g.title || g.username || "N/A"}`);
//   //   }

//   process.exit(0);
// })();

connectDb();
