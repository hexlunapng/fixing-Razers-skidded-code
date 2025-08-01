import mongoose, { Schema, Document, model, Types } from 'mongoose'

interface IFriendEntry {
  accountId: string
  created: string
  alias?: string
}

export interface IFriendList {
  accepted: IFriendEntry[]
  incoming: IFriendEntry[]
  outgoing: IFriendEntry[]
  blocked: IFriendEntry[]
}

export interface IFriends extends Document {
  accountId: string
  list: IFriendList
}

const FriendEntrySchema = new Schema<IFriendEntry>(
  {
    accountId: { type: String, required: true },
    created: { type: String, required: true },
    alias: { type: String, required: false },
  },
  { _id: false }
)

const FriendListSchema = new Schema<IFriendList>(
  {
    accepted: { type: [FriendEntrySchema], default: [] },
    incoming: { type: [FriendEntrySchema], default: [] },
    outgoing: { type: [FriendEntrySchema], default: [] },
    blocked: { type: [FriendEntrySchema], default: [] },
  },
  { _id: false }
)

const FriendsSchema = new Schema<IFriends>(
  {
    accountId: { type: String, required: true, unique: true },
    list: { type: FriendListSchema, required: true, default: () => ({ accepted: [], incoming: [], outgoing: [], blocked: [] }) },
  },
  {
    collection: 'friends',
    timestamps: false,
  }
)

export default model<IFriends>('Friends', FriendsSchema)
