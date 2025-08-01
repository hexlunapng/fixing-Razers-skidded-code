import { Hono } from "hono";

const router = new Hono();

// TODO: add arena/tournaments
router.get('/api/v1/events/Fortnite/download/*', (c) => c.json({}))

router.get('/fortnite/api/game/v2/events/tournamentandhistory/*/*/*', (c) => c.json({}))

router.post('/fortnite/api/game/v2/events/v2/setSubgroup/*', (c) => c.body(null, 204))

export default router