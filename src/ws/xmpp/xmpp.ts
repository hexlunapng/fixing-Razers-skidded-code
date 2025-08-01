import { Hono } from 'hono'
import { serve, type ServerWebSocket } from 'bun'
import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import * as xmpp from './xmppFunctions'
import * as functions from '../../utils/functions'
import User from "../../models/user";
import Friends from '../../models/friends'
import { Log } from '../../utils/logger'

const port = Number(process.env.XMPP_PORT) || 80
const router = new Hono()

export interface Client {
  client: ServerWebSocket<unknown>
  jid: string
  accountId: string
  displayName: string
  token: string
  resource: string
  lastPresenceUpdate: {
    away: boolean
    status: string
  }
}

declare global {
  var Clients: Client[]
  var MUCs: Record<string, { members: { accountId: string }[] }>
  var xmppDomain: string
  var accessTokens: { token: string; accountId: string }[]
}

if (!global.Clients) global.Clients = []
if (!global.MUCs) global.MUCs = {}
if (!global.xmppDomain) global.xmppDomain = "prod.ol.epicgames.com"
if (!global.accessTokens) global.accessTokens = []

router.get('/', (c) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Content-Type', 'application/json')
  return c.json({
    Clients: {
      amount: global.Clients.length,
      clients: global.Clients.map((i) => i.displayName),
    },
  })
})

router.get('/clients', (c) => {
  c.header('Content-Type', 'application/json')
  return c.json({
    amount: global.Clients.length,
    clients: global.Clients.map((i) => i.displayName),
  })
})

serve({
  port: port,
  fetch(req, server) {
    const upgrade = req.headers.get('upgrade')?.toLowerCase()
    const protocol = req.headers.get('sec-websocket-protocol')?.toLowerCase()
    if (upgrade === 'websocket' && protocol === 'xmpp') {
      return server.upgrade(req, { data: {} }) ? undefined : new Response("Upgrade failed", { status: 400 })
    }
    return router.fetch(req)
  },

  websocket: {
    open(ws) {
      ws.data = {
        joinedMUCs: [] as string[],
        accountId: '',
        displayName: '',
        token: '',
        jid: '',
        resource: '',
        ID: '',
        Authenticated: false,
        clientExists: false,
        connectionClosed: false,
      }
    },

    async message(ws, raw) {
      const data = ws.data as any
      let message = typeof raw === 'string'
        ? raw
        : new TextDecoder().decode(raw as Uint8Array)

      const parser = new XMLParser({
        ignoreAttributes: false
      })
      
      let msg
      try {
        msg = parser.parse(message)
      } catch {
        Log.Error('Error parsing xmpp message')
        xmpp.sendError(ws)
        return
      }

      const nodeName = Object.keys(msg)[0]
      const baseName = nodeName!.includes(':') ? nodeName!.split(':')[1] : nodeName
      const root = msg[nodeName!]

      if (!['open', 'auth', 'iq', 'message', 'presence', 'close'].includes(baseName!)) {
        Log.Error('Unknown XMPP node:', nodeName)
        xmpp.sendError(ws)
        return
      }

      switch (baseName) {
        case 'open': {
            const openData = root
            handleOpen(ws, data, openData)
            break
        }

        case 'auth': {
            const content = root["#text"] || root.content || root
            if (!content) {
                Log.Error('Auth content shit missing idfk')
                xmpp.sendError(ws)
                return
            }
            await handleAuth(ws, content, data)
            break
        }

        case 'iq': {
            await handleIQ(ws, root, data)
            break
        }

        case 'message': {
            await handleMessage(ws, root, data)
            break
        }

        case 'presence': {
            await handlePresence(ws, root, data.accountId, data.displayName, data.jid, data.resource, data.joinedMUCs, data.clientExists)
            break
        }

        case 'close': {
            ws.close()
        }
      }

      if (!data.clientExists && !data.connectionClosed) {
        if (data.accountId && data.displayName && data.token && data.jid && data.ID && data.resource && data.Authenticated) {
          global.Clients.push({
            client: ws,
            accountId: data.accountId,
            displayName: data.displayName,
            token: data.token,
            jid: data.jid,
            resource: data.resource,
            lastPresenceUpdate: { away: false, status: '{}' },
          })
          data.clientExists = true
        }
      }
    },

    close(ws) {
      const { joinedMUCs } = ws.data as any
      xmpp.removeClient(ws, joinedMUCs)
    },
  },
})

Log.XMPP(`XMPP started on port ${port}`)

function handleOpen(ws: ServerWebSocket<unknown>, data: any, openData: any) {
  if (!data.ID) {
    data.ID = functions.MakeID();
  }

  const openXML = new XMLBuilder({ ignoreAttributes: false }).build({
    open: {
      "@_xmlns": "urn:ietf:params:xml:ns:xmpp-framing",
      "@_from": global.xmppDomain,
      "@_id": data.ID,
      "@_version": "1.0",
      "@_xml:lang": "en",
    },
  });
  ws.send(xmpp.removeXmlDeclaration(openXML));

  const featuresXML = new XMLBuilder({ ignoreAttributes: false }).build({
    "stream:features": {
      "@_xmlns:stream": "http://etherx.jabber.org/streams",
      ...(data.Authenticated
        ? {
            ver: { "@_xmlns": "urn:xmpp:features:rosterver" },
            starttls: { "@_xmlns": "urn:ietf:params:xml:ns:xmpp-tls" },
            bind: { "@_xmlns": "urn:ietf:params:xml:ns:xmpp-bind" },
            compression: {
              "@_xmlns": "http://jabber.org/features/compress",
              method: "zlib",
            },
            session: { "@_xmlns": "urn:ietf:params:xml:ns:xmpp-session" },
          }
        : {
            mechanisms: {
              "@_xmlns": "urn:ietf:params:xml:ns:xmpp-sasl",
              mechanism: "PLAIN",
            },
            ver: { "@_xmlns": "urn:xmpp:features:rosterver" },
            starttls: { "@_xmlns": "urn:ietf:params:xml:ns:xmpp-tls" },
            compression: {
              "@_xmlns": "http://jabber.org/features/compress",
              method: "zlib",
            },
            auth: { "@_xmlns": "http://jabber.org/features/iq-auth" },
          }),
    },
  });

  ws.send(featuresXML);
}

async function handleAuth(ws: ServerWebSocket<unknown>, content: string, data: { accountId: string, displayName: string, token: string, Authenticated: boolean }) {
  if (data.accountId) return

  if (!content) {
    Log.Error('Content missing idfk')
    xmpp.sendError(ws)
    return
  }

  let decoded: string
  try {
    decoded = functions.DecodeBase64(content)
  } catch {
    Log.Error('DecodeBase64 had a skill issue')
    xmpp.sendError(ws)
    return
  }

  if (!decoded.includes('\u0000')) {
    Log.Error('decoded includes \u0000 idfk tbh')
    xmpp.sendError(ws)
    return
  }

  const parts = decoded.split('\u0000')
  if (parts.length !== 3) {
    Log.Error('parts.length is not 3')
    xmpp.sendError(ws)
    return
  }

  const tokenStr = parts[2]
  const object = global.accessTokens.find(i => i.token == tokenStr);
  if (!object) {
    Log.Error('object missing')
    xmpp.sendError(ws)
    return
  }

  if (global.Clients.find(c => c.accountId === object.accountId)) {
    Log.Error('account missing')
    xmpp.sendError(ws)
    return
  }

  const user = await User.findOne({ accountId: object.accountId })
  if (!user || user.banned) {
    Log.Error('user missing')
    xmpp.sendError(ws)
    return
  }

  data.accountId = user.accountId
  data.displayName = user.username
  data.token = object.token
  data.Authenticated = true

  Log.XMPP(`${data.displayName} has authenticated.`)

  const successXML = new XMLBuilder({ ignoreAttributes: false }).build({
    success: { '@_xmlns': 'urn:ietf:params:xml:ns:xmpp-sasl' }
  })

  ws.send(successXML)
}

async function handleIQ(ws: ServerWebSocket<unknown>, root: any, data: { accountId: string, resource: string, jid: string, clientExists: boolean }) {
  const id = root['@_id'] || ''
  if (!id) return

  switch (id) {
    case '_xmpp_bind1': {
      if (data.resource || !data.accountId) return

      const resourceValue = root.bind?.resource
      if (!resourceValue) return

      if (global.Clients.find(c => c.accountId === data.accountId)) {
        Log.Error('user missing')
        xmpp.sendError(ws)
        return
      }

      data.resource = resourceValue
      data.jid = `${data.accountId}@${global.xmppDomain}/${data.resource}`

      const xml = new XMLBuilder({ ignoreAttributes: false }).build({
        iq: {
          '@_to': data.jid,
          '@_id': '_xmpp_bind1',
          '@_xmlns': 'jabber:client',
          '@_type': 'result',
          bind: {
            '@_xmlns': 'urn:ietf:params:xml:ns:xmpp-bind',
            jid: data.jid
          }
        }
      })

      ws.send(xml)
      break
    }

    case '_xmpp_session1': {
      if (!data.clientExists) {
        Log.Error('user data missing')
        xmpp.sendError(ws)
        return
      }

      const xml = new XMLBuilder({ ignoreAttributes: false }).build({
        iq: {
          '@_to': data.jid,
          '@_from': global.xmppDomain,
          '@_id': '_xmpp_session1',
          '@_xmlns': 'jabber:client',
          '@_type': 'result'
        }
      })

      ws.send(xml)
      await xmpp.getFriendsPresence(ws, data.accountId, data.jid)
      break
    }

    default: {
      if (!data.clientExists) {
        Log.Error('user data missing (default)')
        xmpp.sendError(ws)
        return
      }

      const xml = new XMLBuilder({ ignoreAttributes: false }).build({
        iq: {
          '@_to': data.jid,
          '@_from': global.xmppDomain,
          '@_id': id,
          '@_xmlns': 'jabber:client',
          '@_type': 'result'
        }
      })

      ws.send(xml)
    }
  }
}

async function handleMessage(ws: ServerWebSocket<unknown>, msg: any, data: { accountId: string, jid: string, displayName: string, resource: string, clientExists: boolean }) {
  if (!data.clientExists) {
    xmpp.sendError(ws)
    return
  }

  const body = msg.body
  if (!body) return

  const msgType = msg['@_type'] || ''

  switch (msgType) {
    case 'chat': {
      const toJid = msg['@_to'] || ''
      if (!toJid || body.length >= 300) return

      const receiver = global.Clients.find(
        c => c.jid.split('/')[0] === toJid
      )
      if (!receiver || receiver.accountId === data.accountId) return

      const xml = new XMLBuilder({ ignoreAttributes: false }).build({
        message: {
          '@_to': receiver.jid,
          '@_from': data.jid,
          '@_xmlns': 'jabber:client',
          '@_type': 'chat',
          body
        }
      })

      receiver.client.send(xml)
      break
    }

    case 'groupchat': {
      const toJid = msg['@_to'] || ''
      if (!toJid || body.length >= 300) return

      const roomName = toJid.split('@')[0]
      const muc = global.MUCs[roomName]
      if (!muc) return

      const isMember = muc.members.some(
        (m: any) => m.accountId === data.accountId
      )
      if (!isMember) return

      for (const member of muc.members) {
        const c = global.Clients.find(i => i.accountId === member.accountId)
        if (!c) continue

        const xml = new XMLBuilder({ ignoreAttributes: false }).build({
          message: {
            '@_to': c.jid,
            '@_from': xmpp.getMUCmember(
              roomName,
              data.displayName,
              data.accountId,
              data.resource
            ),
            '@_xmlns': 'jabber:client',
            '@_type': 'groupchat',
            body
          }
        })

        c.client.send(xml)
      }
      break
    }

    default: {
      if (!xmpp.isJSON(body)) return

      let bodyJSON: any
      try {
        bodyJSON = JSON.parse(body)
      } catch {
        return
      }

      if (Array.isArray(bodyJSON)) return
      if (!bodyJSON.type || typeof bodyJSON.type !== 'string') return

      const to = msg['@_to'] || ''
      const id = msg['@_id'] || ''
      const typeAttr = msg['@_type'] || 'normal'
      if (!to || !id) return

      xmpp.sendMessageToClient(data.jid, { ...msg, '@_type': typeAttr }, bodyJSON)
    }
  }
}

async function handlePresence(ws: ServerWebSocket<unknown>, msg: any, accountId: string, displayName: string, jid: string, resource: string, joinedMUCs: string[], clientExists: boolean) {
  if (!clientExists) return xmpp.sendError(ws);

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: false
  });

  const type = msg['@_type'] || ''
  const to = msg['@_to'] || ''

  switch (type) {
    case 'unavailable':
      if (!to) return;

      if (
        to.endsWith(`@muc.${global.xmppDomain}`) ||
        to.split('/')[0].endsWith(`@muc.${global.xmppDomain}`)
      ) {
        if (!to.toLowerCase().startsWith('party-')) return;

        const roomName = to.split('@')[0];

        if (!global.MUCs[roomName]) return;

        const memberIndex = global.MUCs[roomName].members.findIndex((i) => i.accountId === accountId);
        if (memberIndex !== -1) {
          global.MUCs[roomName].members.splice(memberIndex, 1);
          joinedMUCs.splice(joinedMUCs.indexOf(roomName), 1);
        }

        const xml = builder.build({
          presence: {
            '@_to': jid,
            '@_from': xmpp.getMUCmember(roomName, displayName, accountId, resource),
            '@_xmlns': 'jabber:client',
            '@_type': 'unavailable',
            x: {
              '@_xmlns': 'http://jabber.org/protocol/muc#user',
              item: {
                '@_nick': xmpp.getMUCmember(roomName, displayName, accountId, resource).replace(
                  `${roomName}@muc.${global.xmppDomain}/`,
                  ''
                ),
                '@_jid': jid,
                '@_role': 'none'
              },
              status: [
                { '@_code': '110' },
                { '@_code': '100' },
                { '@_code': '170' }
              ]
            }
          }
        });

        ws.send(xml);
        return;
      }
      break;

    default: {
      const hasMUC = msg['muc:x'] || msg['x'];
      if (hasMUC) {
        if (!to) return;

        const roomName = to.split('@')[0];

        if (!global.MUCs[roomName]) global.MUCs[roomName] = { members: [] };

        if (global.MUCs[roomName].members.find((i) => i.accountId === accountId)) return;

        global.MUCs[roomName].members.push({ accountId });
        joinedMUCs.push(roomName);

        const selfPresence = builder.build({
          presence: {
            '@_to': jid,
            '@_from': xmpp.getMUCmember(roomName, displayName, accountId, resource),
            '@_xmlns': 'jabber:client',
            x: {
              '@_xmlns': 'http://jabber.org/protocol/muc#user',
              item: {
                '@_nick': xmpp.getMUCmember(roomName, displayName, accountId, resource).replace(
                  `${roomName}@muc.${global.xmppDomain}/`,
                  ''
                ),
                '@_jid': jid,
                '@_role': 'participant',
                '@_affiliation': 'none'
              },
              status: [
                { '@_code': '110' },
                { '@_code': '100' },
                { '@_code': '170' },
                { '@_code': '201' }
              ]
            }
          }
        });
        ws.send(selfPresence);

        global.MUCs[roomName].members.forEach((member) => {
          const ClientData = global.Clients.find((i) => i.accountId === member.accountId);
          if (!ClientData) return;

          const memberPresence = builder.build({
            presence: {
              '@_from': xmpp.getMUCmember(roomName, ClientData.displayName, ClientData.accountId, ClientData.resource),
              '@_to': jid,
              '@_xmlns': 'jabber:client',
              x: {
                '@_xmlns': 'http://jabber.org/protocol/muc#user',
                item: {
                  '@_nick': xmpp.getMUCmember(roomName, ClientData.displayName, ClientData.accountId, ClientData.resource).replace(
                    `${roomName}@muc.${global.xmppDomain}/`,
                    ''
                  ),
                  '@_jid': ClientData.jid,
                  '@_role': 'participant',
                  '@_affiliation': 'none'
                }
              }
            }
          });
          ws.send(memberPresence);

          if (accountId === ClientData.accountId) return;

          const otherPresence = builder.build({
            presence: {
              '@_from': xmpp.getMUCmember(roomName, displayName, accountId, resource),
              '@_to': ClientData.jid,
              '@_xmlns': 'jabber:client',
              x: {
                '@_xmlns': 'http://jabber.org/protocol/muc#user',
                item: {
                  '@_nick': xmpp.getMUCmember(roomName, displayName, accountId, resource).replace(
                    `${roomName}@muc.${global.xmppDomain}/`,
                    ''
                  ),
                  '@_jid': jid,
                  '@_role': 'participant',
                  '@_affiliation': 'none'
                }
              }
            }
          });
          ClientData.client.send(otherPresence);
        });

        return;
      }
    }
  }

  const status = msg.status;
  if (!status) return;
  if (!xmpp.isJSON(status)) return;
  if (Array.isArray(JSON.parse(status))) return;

  const away = !!msg.show;

  await xmpp.updatePresenceForFriends(ws, status, away, false);
  const friends = await Friends.findOne({ accountId });
  if (friends) {
    for (const friend of friends.list.accepted) {
      xmpp.getUserPresence(friend.accountId, accountId, false);
    }
  }
}