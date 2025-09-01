import Number from "../models/Number.js";
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
  if (
    code === 401 &&
    (msg.includes("AUTH_KEY_UNREGISTERED") || msg.includes("SESSION_REVOKED"))
  ) {
    console.error(`❌ Session revoked or logged out for ${numberDoc.phone}`);
    // DB: delete or mark dead
    // return null;
    for (const u of global.users) {
      global.bot.telegram.sendMessage(u, accountAlert);
    }
    await deleteAcc(justPhone, numberDoc);
  } else if (code === 400 && msg.includes("AUTH_BYTES_INVALID")) {
    console.error(`❌ Corrupted session string for ${numberDoc.phone}`);
    // DB: delete or mark dead
    // return null;
    for (const u of global.users) {
      global.bot.telegram.sendMessage(u, accountAlert);
    }
    await deleteAcc(justPhone, numberDoc);
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
    for (const u of global.users) {
        console.log(u)
      global.bot.telegram.sendMessage(u, thisMsg);
    }
    await deleteAcc(justPhone, numberDoc);
  }

  // You can add other checks like API_ID_INVALID if needed:
  else if (msg.includes("API_ID_INVALID")) {
    console.error(`❌ Invalid API_ID/HASH for ${numberDoc.phone}`);
    // return null;
    for (const u of global.users) {
      global.bot.telegram.sendMessage(u, accountAlert);
    }
    await deleteAcc(justPhone, numberDoc);
  } else {
    // For other errors, log and don't delete the session
    console.error(`⚠️ Unexpected error for ${numberDoc.phone}:`, err);
  }
};

export default handleArrErr;
