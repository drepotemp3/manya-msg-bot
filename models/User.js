import {model, Schema} from "mongoose"

const userSchema = new Schema({
    chatId:Number
})

const User = model("User", userSchema)
export default User