import { model, Schema } from "mongoose";

const userSchema = new Schema({
  chatId: {
    type: Number,
    unique: true, // enforce uniqueness at Mongo level
    required: true,
  },
});

const User = model("User", userSchema);
export default User;
