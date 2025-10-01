import Number from "../models/Number.js";
import "dotenv/config";
import startMessaging, { stopMessaging } from "../services/startMessaging.js";

const deleteAcc = async (justPhone, numberDoc) => {
  //Delete acc
  try {
    if (justPhone) {
      await Number.findOneAndDelete({ phone: numberDoc });
    } else {
      await Number.findOneAndDelete({ phone: numberDoc.phone });
    }
  } catch (error) {
    console.log(
      "Error deleting telegram acc after message-error-flag\n\n",
      error
    );
  }
};

const handleArrErr = async (err, numberDoc, justPhone = false) => {
  // Detect invalid session by code or message
  const msg = err?.errorMessage?.toUpperCase() || err?.message?.toUpperCase();
  const code = err?.code;
  
  // CRITICAL FIX: IGNORE permission errors - these are group-specific, NOT session errors
  // These errors mean the bot can't send to specific groups, but the account is still valid
  if (msg && (msg.includes('CHAT_WRITE_FORBIDDEN') || 
      msg.includes('CHAT_ADMIN_REQUIRED') ||
      msg.includes('USER_BANNED_IN_CHANNEL') ||
      msg.includes('CHAT_SEND_') || // Catches CHAT_SEND_PLAIN_FORBIDDEN, etc.
      msg.includes('SLOWMODE_WAIT_'))) { // Slowmode is not an account error
    console.log(`ℹ️ Permission/slowmode error (non-critical, group-specific): ${msg}`);
    return; // Don't delete account - just a group permission issue
  }

  const accountAlert = `
🚫⛔⚠️

This account below has been logged out or frozen👇
${
  justPhone
    ? `Phone: ${numberDoc}`
    : `Phone: ${numberDoc.phone}
Username: ${numberDoc.username}`
}

Please check to confirm, and log back in.
For now it will no longer send messages to the groups until you log back in.


Neeche wala account logout ya freeze ho gaya hai 👇
${
  justPhone
    ? `Phone: ${numberDoc}`
    : `Phone: ${numberDoc.phone}
Username: ${numberDoc.username}`
}

Kripya check karke confirm karein, aur dobara login karein.  
Abhi ke liye yeh groups mein messages nahi bhejega jab tak aap dobara login nahi karte.
`;
 try {
   if (
    code === 401 &&
    (msg.includes("AUTH_KEY_UNREGISTERED") || msg.includes("SESSION_REVOKED"))
  ) {
    console.error(`❌ Session revoked or logged out or account restricted for ${justPhone ? numberDoc : numberDoc.phone}`);
    // DB: delete or mark dead
    // return null;
    await stopMessaging();

    for (const u of global.users) {
      global.bot.telegram.sendMessage(u, accountAlert);
    }
    await deleteAcc(justPhone, numberDoc);
    await startMessaging();
  } else if (code === 400 && msg.includes("AUTH_BYTES_INVALID")) {
    console.error(`❌ Corrupted session string for ${justPhone ? numberDoc : numberDoc.phone}`);
    // DB: delete or mark dead
    // return null;
    await stopMessaging();

    for (const u of global.users) {
      global.bot.telegram.sendMessage(u, accountAlert);
    }
    await deleteAcc(justPhone, numberDoc);
    await startMessaging();
  } else if (code === 406 && msg.includes("AUTH_KEY_DUPLICATED")) {
    let thisMsg = `
    🚫⛔⚠️

A problem occured with this account👇
${
  justPhone
    ? `Phone: ${numberDoc}`
    : `Phone: ${numberDoc.phone}
Username: ${numberDoc.username}`
}

Please check if the account is working on your telegram, and login again inside this bot.
`;
    await stopMessaging();
    for (const u of global.users) {
      console.log(u);
      global.bot.telegram.sendMessage(u, thisMsg);
    }
    await deleteAcc(justPhone, numberDoc);
    await startMessaging();
  }
  // You can add other checks like API_ID_INVALID if needed:
  else if (msg && msg.includes("API_ID_INVALID")) {
    console.error(`❌ Invalid API_ID/HASH for ${justPhone ? numberDoc : numberDoc.phone}`);
    // return null;
    await stopMessaging();
    for (const u of global.users) {
      global.bot.telegram.sendMessage(u, accountAlert);
    }
    await deleteAcc(justPhone, numberDoc);
    await startMessaging();
  } else if (msg && msg.includes("USER_DEACTIVATED")) {
    console.error(`❌ Account deactivated for ${justPhone ? numberDoc : numberDoc.phone}`);
    await stopMessaging();
    for (const u of global.users) {
      global.bot.telegram.sendMessage(u, accountAlert);
    }
    await deleteAcc(justPhone, numberDoc);
    await startMessaging();
  } else if (code === 420) {
    // Flood wait - this is temporary, don't delete account
    console.warn(`⚠️ Flood wait error for ${justPhone ? numberDoc : numberDoc.phone}: ${msg}`);
    // Don't delete account - this is temporary
  } else {
    // For other errors, log and don't delete the session
    console.error(`⚠️ Unexpected error for ${justPhone ? numberDoc : numberDoc.phone}:`, err);
  }
 } catch (error) {
  console.log("Error notifying admin of account restriction\n",error)
 }
};

export default handleArrErr;