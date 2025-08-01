import { Hono } from "hono";
import { verifyToken } from "../tokens/tokenFunctions";
import type { IUser } from "../models/user";
import type { Env } from "../types/env";
import qs from "qs";
import * as error from "../utils/error";
import kv from '../utils/kv';
import * as functions from "../utils/functions";

const router = new Hono<Env>();
const g = global as unknown as NodeJS.Global;

let buildUniqueId = {};
g.kv = kv

router.get('/fortnite/api/matchmaking/session/findPlayer/*', (c) => c.body(null, 204))

router.get('/fortnite/api/game/v2/matchmakingservice/ticket/player/*', verifyToken, async (c) => {
    let user: IUser | null
    user = c.get('user')
    if (user.isServer) return c.status(403)
    if (user.matchmakingId === null) return c.status(403)

    const queryString = new URL(c.req.url).search.slice(1)
    const bucketId = qs.parse(queryString, { ignoreQueryPrefix: true })['bucketId']

    if (typeof bucketId !== "string" || bucketId.split(":").length !== 4) {
        return c.status(400)
    }

    const playlist = bucketId.split(":")[3]
    const gameServers = process.env.GAMESERVER_IPS!
    const serverList = gameServers.split(",").map(s => s.split(";")[0]!.split("#")[0]!.trim()).filter(Boolean)

    let selectedServer = serverList.find((server: string) => {
        const parts = server.split(":")
        return parts.length >= 3 && parts[2]!.toLowerCase() === playlist!.toLowerCase()
    })
    if (!selectedServer) {
        return error.createError(c,
            "errors.com.epicgames.playlist.not_found",
            `No server found for playlist ${playlist}`,
            [], 1013, "invalid_playlist", 404
        )
    }

    await g.kv.set(`playerPlaylist:${user.accountId}`, playlist)

    if (typeof c.req.query('bucketId') !== "string" || c.req.query('bucketId')!.split(":").length !== 4) {
        return c.status(400)
    }

    (buildUniqueId as any)[user.accountId] = c.req.query('bucketId')!.split(":")[0];

    const matchmakerIP = process.env.MATCHMAKER_IP
    return c.json({
        serviceUrl: matchmakerIP,
        ticketType: "mms-player",
        payload: user.matchmakingId,
        signature: "account"
    })
})

router.get('/fortnite/api/game/v2/matchmaking/account/:accountId/session/:sessionId', (c) => {
    return c.json({
        accountId: c.req.param('accountId'),
        sessionId: c.req.param('sessionId'),
        key: "none"
    })
})

router.get('/fortnite/api/matchmaking/session/:sessionId', verifyToken, async (c) => {
    let user: IUser | null
    let kvDocument
    user = c.get('user')
    const playlist = await g.kv.get(`playerPlaylist:${user.accountId}`)
    const gameServers = process.env.GAMESERVER_IPS!
    const serverList = gameServers.split(",").map(s => s.split(";")[0]!.split("#")[0]!.trim())
    let selectedServer = serverList.find((server: string) => server.split(":")[2]!.toLowerCase() === playlist)
    if (!selectedServer) {
        return error.createError(c,
            "errors.com.epicgames.playlist.not_found",
            `No server found for playlist ${playlist}`,
            [], 1013, "invalid_playlist", 404
        )
    }
    kvDocument = JSON.stringify({
        ip: selectedServer.split(":")[0],
        port: selectedServer.split(":")[1],
        playlist: selectedServer.split(":")[2]
    })
    let codeKV = JSON.parse(kvDocument)
    
    return c.json({
        id: c.req.param('sessionId'),
        ownerId: functions.MakeID().replace(/-/ig, "").toUpperCase(),
        ownerName: "[DS]fortnite-liveeugcec1c2e30ubrcore0a-z8hj-1968",
        serverName: "[DS]fortnite-liveeugcec1c2e30ubrcore0a-z8hj-1968",
        serverAddress: codeKV.ip,
        serverPort: codeKV.port,
        maxPublicPlayers: 220,
        openPublicPlayers: 175,
        maxPrivatePlayers: 0,
        openPrivatePlayers: 0,
        attributes: {
            REGION_s: "EU",
            GAMEMODE_s: "FORTATHENA",
            ALLOWBROADCASTING_b: true,
            SUBREGION_s: "GB",
            DCID_s: "FORTNITE-LIVEEUGCEC1C2E30UBRCORE0A-14840880",
            tenant_s: "Fortnite",
            MATCHMAKINGPOOL_s: "Any",
            STORMSHIELDDEFENSETYPE_i: 0,
            HOTFIXVERSION_i: 0,
            PLAYLISTNAME_s: codeKV.playlist,
            SESSIONKEY_s: functions.MakeID().replace(/-/ig, "").toUpperCase(),
            TENANT_s: "Fortnite",
            BEACONPORT_i: 15009
        },
        publicPlayers: [],
        privatePlayers: [],
        totalPlayers: 45,
        allowJoinInProgress: false,
        shouldAdvertise: false,
        isDedicated: false,
        usesStats: false,
        allowInvites: false,
        usesPresence: false,
        allowJoinViaPresence: true,
        allowJoinViaPresenceFriendsOnly: false,
        buildUniqueId: (buildUniqueId as any)[user.accountId] || "0",
        lastUpdated: new Date().toISOString(),
        started: false
    })
})

router.post('/fortnite/api/matchmaking/session/*/join', (c) => c.body(null, 204))

router.post('/fortnite/api/matchmaking/session/matchMakingRequest', (c) => c.json([]))

export default router