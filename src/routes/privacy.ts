import { Hono } from "hono";
import Profile from "../models/profiles";
import { verifyToken } from "../tokens/tokenFunctions";
import type { Env } from "../types/env";

const router = new Hono<Env>()

router.get('/fortnite/api/game/v2/privacy/account/:accountId', verifyToken, async (c) => {
    const user = c.get('user')
    const profile = await Profile.findOne({ accountId: user.accountId })

    if (!profile) return c.status(400)

    const athena = (profile.profiles as any).athena

    return c.json({
        accountId: user.accountId,
        optOutOfPublicLeaderboards: athena.stats.attributes.optOutOfPublicLeaderboards
    })
})

router.post('/fortnite/api/game/v2/privacy/account/:accountId', verifyToken, async (c) => {
    const body = await c.req.json<{ optOutOfPublicLeaderboards: boolean }>();
    const user = c.get('user')

    const profiles = await Profile.findOne({ accountId: user.accountId });

    if (!profiles) return c.status(400)

    const athena = (profiles.profiles as any).athena
    athena.stats.attributes.optOutOfPublicLeaderboards = body.optOutOfPublicLeaderboards;

    await profiles.updateOne({
      $set: { "profiles.athena": athena },
    });

    return c.json({
      accountId: profiles.accountId,
      optOutOfPublicLeaderboards: athena.stats.attributes.optOutOfPublicLeaderboards,
    });
})

export default router