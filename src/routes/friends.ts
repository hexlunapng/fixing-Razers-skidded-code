import { Hono } from 'hono'
import { verifyToken } from '../tokens/tokenFunctions.ts'
import Friends from '../models/friends.ts'
import * as friendManager from '../utils/friendsFunctions.ts'
import * as xmpp from '../ws/xmpp/xmppFunctions.ts'
import * as error from '../utils/error.ts'
import type { Env } from '../types/env'

const router = new Hono<Env>()

async function getRawBody(c: any, next: any) {
  const contentLength = c.req.header('content-length')
  if (contentLength && Number(contentLength) > 16) {
    return c.json({ error: 'File size must be 16 bytes or less.' }, 403)
  }
  try {
    const body = await c.req.text()
    ;(c.req as any).rawBody = body
  } catch {
    return c.json({ error: 'Something went wrong while trying to access the request body.' }, 400)
  }
  await next()
}

router.get('/friends/api/v1/*/settings', (c) => c.json({}))

router.get('/friends/api/v1/*/blocklist', (c) => c.json([]))

router.get('/friends/api/public/list/fortnite/*/recentPlayers', (c) => c.json([]))

router.all('/friends/api/v1/*/friends/:friendId/alias', verifyToken, getRawBody, async (c) => {
    const { friendId } = c.req.param()
    const method = c.req.method

    const userAccountId = c.get('user')?.accountId

    if (!userAccountId) return c.json({ error: 'Unauthorized' }, 401)

    const friends = await Friends.findOne({ accountId: userAccountId })

    const validationFail = () => error.createError(c,
      'errors.com.epicgames.validation.validation_failed',
      'Validation Failed. Invalid fields were [alias]',
      ['[alias]'], 1040, undefined, 404
    )

    const allowedCharacters = (" !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~").split("")

    for (const character of (c.req as any).rawBody) {
      if (!allowedCharacters.includes(character)) return validationFail()
    }

    if (!friends?.list.accepted.find((i: any) => i.accountId === friendId)) {
      return error.createError(c,
        'errors.com.epicgames.friends.friendship_not_found',
        `Friendship between ${userAccountId} and ${friendId} does not exist`,
        [userAccountId, friendId], 14004, undefined, 404
      )
    }

    const friendIndex = friends.list.accepted.findIndex((i: any) => i.accountId === friendId)

    switch (method) {
      case 'PUT':
        if ((c.req as any).rawBody.length < 3 || (c.req as any).rawBody.length > 16) return validationFail()

        friends.list.accepted[friendIndex]!.alias = (c.req as any).rawBody
        await friends.updateOne({ $set: { list: friends.list } })
        break

      case 'DELETE':
        friends.list.accepted[friendIndex]!.alias = ''
        await friends.updateOne({ $set: { list: friends.list } })
        break
    }

    return c.body(null, 204)
  }
)

router.get('/friends/api/public/friends/:accountId', verifyToken, async (c) => {
  const userAccountId = c.get('user')?.accountId || c.req.header('x-user-account-id')
  if (!userAccountId) return c.json({ error: 'Unauthorized' }, 401)

  const friends = await Friends.findOne({ accountId: userAccountId }).lean()

  const response: any[] = []

  friends!.list.accepted.forEach((acceptedFriend: any) => {
    response.push({
      accountId: acceptedFriend.accountId,
      status: 'ACCEPTED',
      direction: 'OUTBOUND',
      created: acceptedFriend.created,
      favorite: false,
    })
  })

  friends!.list.incoming.forEach((incomingFriend: any) => {
    response.push({
      accountId: incomingFriend.accountId,
      status: 'PENDING',
      direction: 'INBOUND',
      created: incomingFriend.created,
      favorite: false,
    })
  })

  friends!.list.outgoing.forEach((outgoingFriend: any) => {
    response.push({
      accountId: outgoingFriend.accountId,
      status: 'PENDING',
      direction: 'OUTBOUND',
      created: outgoingFriend.created,
      favorite: false,
    })
  })

  return c.json(response)
})

router.post('/friends/api/*/friends/*/:receiverId', verifyToken, async (c) => {
  const userAccountId = c.get('user')?.accountId || c.req.header('x-user-account-id')
  const { receiverId } = c.req.param()
  if (!userAccountId) return c.json({ error: 'Unauthorized' }, 401)

  const sender = await Friends.findOne({ accountId: userAccountId })
  const receiver = await Friends.findOne({ accountId: receiverId })
  if (!sender || !receiver) return c.status(403)

  if (sender.list.incoming.find((i: any) => i.accountId === receiver.accountId)) {
    if (!await friendManager.acceptFriendReq(sender.accountId, receiver.accountId)) return c.status(403)

    xmpp.getUserPresence(sender.accountId, receiver.accountId, false)
    xmpp.getUserPresence(receiver.accountId, sender.accountId, false)
  } else if (!sender.list.outgoing.find((i: any) => i.accountId === receiver.accountId)) {
    if (!await friendManager.sendFriendReq(sender.accountId, receiver.accountId)) return c.status(403)
  }

  return c.body(null, 204)
})

router.delete('/friends/api/*/friends/*/:receiverId', verifyToken, async (c) => {
  const userAccountId = c.get('user')?.accountId
  const { receiverId } = c.req.param()
  if (!userAccountId) return c.json({ error: 'Unauthorized' }, 401)

  const sender = await Friends.findOne({ accountId: userAccountId })
  const receiver = await Friends.findOne({ accountId: receiverId })
  if (!sender || !receiver) return c.status(403)

  if (!await friendManager.deleteFriend(sender.accountId, receiver.accountId)) return c.status(403)

  xmpp.getUserPresence(sender.accountId, receiver.accountId, true)
  xmpp.getUserPresence(receiver.accountId, sender.accountId, true)

  return c.body(null, 204)
})

router.post('/friends/api/*/blocklist/*/:receiverId', verifyToken, async (c) => {
  const userAccountId = c.get('user')?.accountId || c.req.header('x-user-account-id')
  const { receiverId } = c.req.param()
  if (!userAccountId) return c.json({ error: 'Unauthorized' }, 401)

  const sender = await Friends.findOne({ accountId: userAccountId })
  const receiver = await Friends.findOne({ accountId: receiverId })
  if (!sender || !receiver) return c.status(403)

  if (!await friendManager.blockFriend(sender.accountId, receiver.accountId)) return c.status(403)

  xmpp.getUserPresence(sender.accountId, receiver.accountId, true)
  xmpp.getUserPresence(receiver.accountId, sender.accountId, true)

  return c.status(204)
})

router.delete('/friends/api/*/blocklist/*/:receiverId', verifyToken, async (c) => {
  const userAccountId = c.get('user')?.accountId || c.req.header('x-user-account-id')
  const { receiverId } = c.req.param()
  if (!userAccountId) return c.json({ error: 'Unauthorized' }, 401)

  const sender = await Friends.findOne({ accountId: userAccountId })
  const receiver = await Friends.findOne({ accountId: receiverId })
  if (!sender || !receiver) return c.status(403)

  if (!await friendManager.deleteFriend(sender.accountId, receiver.accountId)) return c.status(403)

  return c.status(204)
})

router.get('/friends/api/v1/:accountId/summary', verifyToken, async (c) => {
  const userAccountId = c.get('user')?.accountId || c.req.header('x-user-account-id')
  if (!userAccountId) return c.json({ error: 'Unauthorized' }, 401)

  const response = {
    friends: [] as any[],
    incoming: [] as any[],
    outgoing: [] as any[],
    suggested: [] as any[],
    blocklist: [] as any[],
    settings: {
      acceptInvites: 'public'
    }
  }

  const friends = await Friends.findOne({ accountId: userAccountId }).lean()

  friends!.list.accepted.forEach((acceptedFriend: any) => {
    response.friends.push({
      accountId: acceptedFriend.accountId,
      groups: [],
      mutual: 0,
      alias: acceptedFriend.alias ?? '',
      note: '',
      favorite: false,
      created: acceptedFriend.created
    })
  })

  friends!.list.incoming.forEach((incomingFriend: any) => {
    response.incoming.push({
      accountId: incomingFriend.accountId,
      mutual: 0,
      favorite: false,
      created: incomingFriend.created
    })
  })

  friends!.list.outgoing.forEach((outgoingFriend: any) => {
    response.outgoing.push({
      accountId: outgoingFriend.accountId,
      favorite: false
    })
  })

  friends!.list.blocked.forEach((blockedFriend: any) => {
    response.blocklist.push({
      accountId: blockedFriend.accountId
    })
  })

  return c.json(response)
})

router.get('/friends/api/public/blocklist/*', verifyToken, async (c) => {
  const userAccountId = c.get('user')?.accountId || c.req.header('x-user-account-id')
  if (!userAccountId) return c.json({ error: 'Unauthorized' }, 401)

  const friends = await Friends.findOne({ accountId: userAccountId }).lean()

  return c.json({
    blockedUsers: friends!.list.blocked.map((i: any) => i.accountId)
  })
})

export default router
