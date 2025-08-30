import {model, Schema} from "mongoose"

const numberSchema = Schema({
    phone:String,
    password:String,
    session:String,
    username:String,
    message:[String],
})

export const Number = model("Number", numberSchema)