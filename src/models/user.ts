import mongoose, { Schema, Document, model } from 'mongoose'

export interface IUser extends Document {
  created: Date
  banned: boolean
  discordId?: string | null
  accountId: string
  username: string
  email: string
  password: string
  matchmakingId: string
  isServer: boolean
  acceptedEULA: boolean
}

const UserSchema = new Schema<IUser>(
  {
    created: { type: Date, required: true, default: () => new Date() },
    banned: { type: Boolean, default: false },
    discordId: { type: String, default: null, sparse: true },
    accountId: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    matchmakingId: { type: String, required: true, unique: true },
    isServer: { type: Boolean, default: false },
    acceptedEULA: { type: Boolean, required: true, default: false },
  },
  {
    collection: 'users',
  }
)

export default model<IUser>('User', UserSchema)
