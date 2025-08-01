import mongoose, { Schema, Document, model } from 'mongoose'

export interface IProfiles extends Document {
  created: Date
  accountId: string
  profiles: Object
}

const ProfilesSchema = new Schema<IProfiles>(
  {
    created: { type: Date, required: true, default: () => new Date() },
    accountId: { type: String, required: true, unique: true },
    profiles: { type: Object, required: true },
  },
  {
    collection: 'profiles',
  }
)

export default model<IProfiles>('Profiles', ProfilesSchema)
