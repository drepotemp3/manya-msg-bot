import { mongoose } from "mongoose";
import "dotenv/config";
import launchBot from "../helpers/launchBot.js";
import User from "../models/User.js";

let isConnecting = false;

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

function connectDb(retryCount = 0) {
  if (isConnecting) return;
  isConnecting = true;

  console.log("🟡 Attempting to connect to MongoDB...");

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
      loadUsers(); //Load all users into cache
    })
    .catch((err) => {
      global.messaging = false;
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
