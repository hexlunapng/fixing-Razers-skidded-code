import { type ServerWebSocket } from 'bun'
import { XMLBuilder } from 'fast-xml-parser'
import Friends, { type IFriends } from '../../models/friends'
import * as XMPP from './xmpp'
import * as functions from '../../utils/functions'
import { Log } from '../../utils/logger'

declare global {
  var Clients: XMPP.Client[]
  var MUCs: Record<string, { members: { accountId: string }[] }>
  var xmppDomain: string
}

export function sendError(ws: ServerWebSocket<unknown>) {
  const xml = new XMLBuilder().build({
    close: { '@_xmlns': 'urn:ietf:params:xml:ns:xmpp-framing' }
  })
  ws.send(xml)
  ws.close()
}

export function removeClient(ws: ServerWebSocket<unknown>, joinedMUCs: string[]) {
  const clientIndex = global.Clients.findIndex((i) => i.client === ws)
  if (clientIndex === -1) return

  const client = global.Clients[clientIndex]
  const ClientStatus = JSON.parse(client!.lastPresenceUpdate.status)

  updatePresenceForFriends(ws, '{}', false, true)
  global.Clients.splice(clientIndex, 1)

  for (const roomName of joinedMUCs) {
    if (global.MUCs[roomName]) {
      const memberIndex = global.MUCs[roomName].members.findIndex(
        (i) => i.accountId === client!.accountId
      )
      if (memberIndex !== -1)
        global.MUCs[roomName].members.splice(memberIndex, 1)
    }
  }

  let partyId = ''
  try {
    if (ClientStatus.Properties && isObject(ClientStatus.Properties)) {
      for (const key in ClientStatus.Properties) {
        if (key.toLowerCase().startsWith('party.joininfo')) {
          const prop = ClientStatus.Properties[key]
          if (isObject(prop)) {
            const obj = prop as Record<string, unknown>
            if (typeof obj.partyId === 'string') {
              partyId = obj.partyId
            }
          }
        }
      }
    }
  } catch {}

  if (partyId && typeof partyId === 'string') {
    global.Clients.forEach((ClientData) => {
      if (client!.accountId === ClientData.accountId) return

      const xml = new XMLBuilder().build({
        message: {
          '@_id': functions.MakeID().replace(/-/gi, '').toUpperCase(),
          '@_from': client!.jid,
          '@_xmlns': 'jabber:client',
          '@_to': ClientData.jid,
          body: JSON.stringify({
            type: 'com.epicgames.party.memberexited',
            payload: {
              partyId,
              memberId: client!.accountId,
              wasKicked: false,
            },
            timestamp: new Date().toISOString(),
          }),
        },
      })

      ClientData.client.send(xml)
    })
  }

  Log.XMPP(`${client!.displayName} has logged out`)
}

export async function getFriendsPresence(ws: ServerWebSocket<unknown>, accountId: string, jid: string) {
  const friends: IFriends | null = await Friends.findOne({ accountId }).lean()
  if (!friends) return

  const accepted = friends.list.accepted
  accepted.forEach((friend) => {
    const ClientData = global.Clients.find(
      (i) => i.accountId === friend.accountId
    )
    if (!ClientData) return

    const presenceObj: any = {
      presence: {
        '@_to': jid,
        '@_xmlns': 'jabber:client',
        '@_from': ClientData.jid,
        '@_type': 'available',
      },
    }

    if (ClientData.lastPresenceUpdate.away) {
      presenceObj.presence.show = 'away'
    }
    presenceObj.presence.status = ClientData.lastPresenceUpdate.status

    const xml = new XMLBuilder().build(presenceObj)
    ws.send(xml)
  })
}

export async function updatePresenceForFriends(ws: ServerWebSocket<unknown>, body: string, away: boolean, offline: boolean) {
  const SenderIndex = global.Clients.findIndex((i) => i.client === ws)
  if (SenderIndex === -1) return

  const SenderData = global.Clients[SenderIndex]
  SenderData!.lastPresenceUpdate.away = away
  SenderData!.lastPresenceUpdate.status = body

  const friends: IFriends | null = await Friends.findOne({
    accountId: SenderData!.accountId,
  })
  if (!friends) return

  const accepted = friends.list.accepted

  accepted.forEach((friend) => {
    const ClientData = global.Clients.find((i) => i.accountId === friend.accountId)
    if (!ClientData) return

    const builder = new XMLBuilder({ ignoreAttributes: false, format: false })

    const presenceObj: any = {
      presence: {
        '@_to': ClientData.jid,
        '@_from': SenderData!.jid,
        '@_xmlns': 'jabber:client',
        '@_type': offline ? 'unavailable' : 'available',
        status: body
      },
    }

    if (away) presenceObj.presence.show = 'away'

    const xml = builder.build(presenceObj)
    ClientData.client.send(xml)
  })
}

export function sendMessageToClient(senderJid: string, root: any, body: string | object) {
  if (typeof body === 'object') body = JSON.stringify(body)

  const to = root['@_to'] || ''
  const id = root['@_id'] || ''

  if (!to) return

  const receiver = global.Clients.find(
    (i) =>
      i.jid.split('/')[0] === to ||
      i.jid === to
  )
  if (!receiver) return

  const xml = new XMLBuilder({ ignoreAttributes: false }).build({
    message: {
      '@_from': senderJid,
      '@_id': id,
      '@_to': receiver.jid,
      '@_xmlns': 'jabber:client',
      body: `${body}`,
    },
  })

  receiver.client.send(xml)
}

export function sendMessageToAll(body: string | object): void {
  if (!global.Clients) return
  if (typeof body === 'object') body = JSON.stringify(body)

  global.Clients.forEach((ClientData) => {
    const xml = new XMLBuilder({ ignoreAttributes: false, format: false }).build({
      message: {
        '@_from': `xmpp-admin@${global.xmppDomain}`,
        '@_xmlns': 'jabber:client',
        '@_to': ClientData.jid,
        body: body,
      },
    })

    ClientData.client.send(xml)
  })
}

export function sendMessageToAccountId(body: string | object, accountId: string): void {
  if (!global.Clients) return
  if (typeof body === 'object') body = JSON.stringify(body)

  const receiver = global.Clients.find((i) => i.accountId === accountId)
  if (!receiver) return

  const xml = new XMLBuilder({ ignoreAttributes: false, format: false }).build({
    message: {
      '@_from': `xmpp-admin@${global.xmppDomain}`,
      '@_xmlns': 'jabber:client',
      '@_to': receiver.jid,
      body: body,
    },
  })

  receiver.client.send(xml)
}

export function getUserPresence(fromId: string, toId: string, offline: boolean): void {
  const SenderData = global.Clients.find((i) => i.accountId === fromId)
  const ClientData = global.Clients.find((i) => i.accountId === toId)

  if (!SenderData || !ClientData) return

  const presenceXml = {
    presence: {
      '@_to': ClientData.jid,
      '@_xmlns': 'jabber:client',
      '@_from': SenderData.jid,
      '@_type': offline ? 'unavailable' : 'available',
      ...(SenderData.lastPresenceUpdate.away
        ? { show: 'away', status: SenderData.lastPresenceUpdate.status }
        : { status: SenderData.lastPresenceUpdate.status }),
    },
  }

  const xml = new XMLBuilder({ ignoreAttributes: false, format: false }).build(presenceXml)
  ClientData.client.send(xml)
}

export function getMUCmember(roomName: string, displayName: string, accountId: string, resource: string) {
  return `${roomName}@muc.${global.xmppDomain}/${encodeURI(displayName)}:${accountId}:${resource}`
}

function isObject(value: any): value is Record<string, unknown> {
  return typeof value === 'object' && !Array.isArray(value) && value !== null
}

export function isJSON(str: string): boolean {
  try {
    JSON.parse(str)
  } catch {
    return false
  }
  return true
}

export function getNick(roomName: string, displayName: string, accountId: string, resource: string, XmppDomain: string): string {
  const full = getMUCmember(roomName, displayName, accountId, resource)
  return full.replace(`${roomName}@muc.${XmppDomain}/`, '')
}

export function findClientByAccountID(accountId: string): XMPP.Client | null {
  for (const c of Clients) {
    if (c.accountId === accountId) {
      return c
    }
  }
  return null
}

export function removeXmlDeclaration(xml: string) {
  return xml.replace(/^<\?xml.*?\?>\s*/, "");
}