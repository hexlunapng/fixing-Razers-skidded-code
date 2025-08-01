import { Hono } from 'hono';
import User, { type IUser } from '../models/user';
import eulaJson from '../../static/responses/EULA.json' assert { type: "json" }
import type { Env } from '../types/env';
import { verifyToken } from '../tokens/tokenFunctions';

const router = new Hono<Env>();

router.get('/eulatracking/api/shared/agreements/fn', (c) => {
    return c.json(eulaJson, 200)
})

router.get('/eulatracking/api/public/agreements/:platform/account/:accountId', verifyToken, async (c) => {
    let user: IUser | null
    user = c.get("user")

    if (!user.acceptedEULA) {
        return c.json(eulaJson, 200)
    } else {
        return c.body(null, 204)
    }
})

router.post('/eulatracking/api/public/agreements/:platform/version/:version/account/:accountId/accept', verifyToken, async (c) => {
    let user: IUser | null
    user = c.get('user')
    let accountId = user.accountId
    if (!user.acceptedEULA) {
        await User.findOneAndUpdate({ accountId }, { $set: { acceptedEULA: true } })
    }

    return c.body(null, 204)
})

export default router