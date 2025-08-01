import Friends, { type IFriends, type IFriendList } from '../models/friends'
import * as xmpp from '../ws/xmpp/xmppFunctions.ts'

export async function validateFriendAdd(accountId: string, friendId: string): Promise<boolean> {
  const sender = await Friends.findOne({ accountId }).lean<IFriends | null>()
  const receiver = await Friends.findOne({ accountId: friendId }).lean<IFriends | null>()
  if (!sender || !receiver) return false

  if (
    sender.list.accepted.find(i => i.accountId === receiver.accountId) ||
    receiver.list.accepted.find(i => i.accountId === sender.accountId)
  )
    return false

  if (
    sender.list.blocked.find(i => i.accountId === receiver.accountId) ||
    receiver.list.blocked.find(i => i.accountId === sender.accountId)
  )
    return false

  if (sender.accountId === receiver.accountId) return false

  return true
}

export async function validateFriendDelete(accountId: string, friendId: string): Promise<boolean> {
  const sender = await Friends.findOne({ accountId }).lean<IFriends | null>()
  const receiver = await Friends.findOne({ accountId: friendId }).lean<IFriends | null>()
  if (!sender || !receiver) return false
  return true
}

export async function validateFriendBlock(accountId: string, friendId: string): Promise<boolean> {
  const sender = await Friends.findOne({ accountId }).lean<IFriends | null>()
  const receiver = await Friends.findOne({ accountId: friendId }).lean<IFriends | null>()
  if (!sender || !receiver) return false

  if (sender.list.blocked.find(i => i.accountId === receiver.accountId)) return false
  if (sender.accountId === receiver.accountId) return false

  return true
}

export async function sendFriendReq(fromId: string, toId: string): Promise<boolean> {
  if (!(await validateFriendAdd(fromId, toId))) return false

  const from = await Friends.findOne({ accountId: fromId })
  const to = await Friends.findOne({ accountId: toId })
  if (!from || !to) return false

  const fromFriends = from.list
  const toFriends = to.list

  fromFriends.outgoing.push({ accountId: to.accountId, created: new Date().toISOString() })

  xmpp.sendMessageToAccountId(
    {
      payload: {
        accountId: to.accountId,
        status: 'PENDING',
        direction: 'OUTBOUND',
        created: new Date().toISOString(),
        favorite: false,
      },
      type: 'com.epicgames.friends.core.apiobjects.Friend',
      timestamp: new Date().toISOString(),
    },
    from.accountId
  )

  toFriends.incoming.push({ accountId: from.accountId, created: new Date().toISOString() })

  xmpp.sendMessageToAccountId(
    {
      payload: {
        accountId: from.accountId,
        status: 'PENDING',
        direction: 'INBOUND',
        created: new Date().toISOString(),
        favorite: false,
      },
      type: 'com.epicgames.friends.core.apiobjects.Friend',
      timestamp: new Date().toISOString(),
    },
    to.accountId
  )

  await from.updateOne({ $set: { list: fromFriends } })
  await to.updateOne({ $set: { list: toFriends } })

  return true
}

export async function acceptFriendReq(fromId: string, toId: string): Promise<boolean> {
  if (!(await validateFriendAdd(fromId, toId))) return false

  const from = await Friends.findOne({ accountId: fromId })
  const to = await Friends.findOne({ accountId: toId })
  if (!from || !to) return false

  const fromFriends = from.list
  const toFriends = to.list

  const incomingIndex = fromFriends.incoming.findIndex(i => i.accountId === to.accountId)

  if (incomingIndex !== -1) {
    fromFriends.incoming.splice(incomingIndex, 1)
    fromFriends.accepted.push({ accountId: to.accountId, created: new Date().toISOString() })

    xmpp.sendMessageToAccountId(
      {
        payload: {
          accountId: to.accountId,
          status: 'ACCEPTED',
          direction: 'OUTBOUND',
          created: new Date().toISOString(),
          favorite: false,
        },
        type: 'com.epicgames.friends.core.apiobjects.Friend',
        timestamp: new Date().toISOString(),
      },
      from.accountId
    )

    const outgoingIndex = toFriends.outgoing.findIndex(i => i.accountId === from.accountId)
    if (outgoingIndex !== -1) toFriends.outgoing.splice(outgoingIndex, 1)

    toFriends.accepted.push({ accountId: from.accountId, created: new Date().toISOString() })

    xmpp.sendMessageToAccountId(
      {
        payload: {
          accountId: from.accountId,
          status: 'ACCEPTED',
          direction: 'OUTBOUND',
          created: new Date().toISOString(),
          favorite: false,
        },
        type: 'com.epicgames.friends.core.apiobjects.Friend',
        timestamp: new Date().toISOString(),
      },
      to.accountId
    )

    await from.updateOne({ $set: { list: fromFriends } })
    await to.updateOne({ $set: { list: toFriends } })
  }

  return true
}

export async function deleteFriend(fromId: string, toId: string): Promise<boolean> {
  if (!(await validateFriendDelete(fromId, toId))) return false

  const from = await Friends.findOne({ accountId: fromId })
  const to = await Friends.findOne({ accountId: toId })
  if (!from || !to) return false

  const fromFriends = from.list
  const toFriends = to.list

  let removed = false

  for (const listType of ['accepted', 'incoming', 'outgoing', 'blocked'] as (keyof IFriendList)[]) {
    const findFriend = fromFriends[listType].findIndex(i => i.accountId === to.accountId)
    const findToFriend = toFriends[listType].findIndex(i => i.accountId === from.accountId)

    if (findFriend !== -1) {
      fromFriends[listType].splice(findFriend, 1)
      removed = true
    }

    if (listType === 'blocked') continue

    if (findToFriend !== -1) toFriends[listType].splice(findToFriend, 1)
  }

  if (removed) {
    xmpp.sendMessageToAccountId(
      {
        payload: {
          accountId: to.accountId,
          reason: 'DELETED',
        },
        type: 'com.epicgames.friends.core.apiobjects.FriendRemoval',
        timestamp: new Date().toISOString(),
      },
      from.accountId
    )

    xmpp.sendMessageToAccountId(
      {
        payload: {
          accountId: from.accountId,
          reason: 'DELETED',
        },
        type: 'com.epicgames.friends.core.apiobjects.FriendRemoval',
        timestamp: new Date().toISOString(),
      },
      to.accountId
    )

    await from.updateOne({ $set: { list: fromFriends } })
    await to.updateOne({ $set: { list: toFriends } })
  }

  return true
}

export async function blockFriend(fromId: string, toId: string): Promise<boolean> {
  if (!(await validateFriendDelete(fromId, toId))) return false
  if (!(await validateFriendBlock(fromId, toId))) return false
  await deleteFriend(fromId, toId)

  const from = await Friends.findOne({ accountId: fromId })
  if (!from) return false
  const fromFriends = from.list

  const to = await Friends.findOne({ accountId: toId })
  if (!to) return false

  fromFriends.blocked.push({ accountId: to.accountId, created: new Date().toISOString() })

  await from.updateOne({ $set: { list: fromFriends } })

  return true
}
