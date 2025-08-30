import { mongoose } from "mongoose";
import "dotenv/config";
import startMessaging from "../services/startMessaging.js";
import launchBot from "../helpers/launchBot.js";

let isConnecting = false;

function connectDb(retryCount = 0) {
  if (isConnecting) return;
  isConnecting = true;

  console.log("🟡 Attempting to connect to MongoDB...");

  console.log(process.env.MONGODB_URI)
  mongoose
    .connect(process.env.MONGODB_URI, {
      dbName: "mania-msg-bot",
    })
    .then(() => {
      console.log("✅ Connected to MongoDB");
      isConnecting = false;

      if (!global.isBotLaunched) {
        launchBot(); // ✅ only launch bot once
        global.isBotLaunched = true;
      }

      global.messaging = true
      startMessaging()
    })
    .catch((err) => {
      global.messaging = false
      console.error(
        `❌ MongoDB connection error (attempt ${retryCount + 1}):`,
        err.message
      );
      isConnecting = false;

      const delay = 2000;
      console.log(`🔁 Retrying MongoDB connection in ${delay / 1000}s...`);
      setTimeout(() => connectDb(retryCount + 1), delay);
    });
}

export default connectDb;
