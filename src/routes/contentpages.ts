import { Hono, type Context } from 'hono'
import * as functions from '../utils/functions.ts'
import * as error from '../utils/error.ts'
import motdTargetData from '../../static/responses/motdTarget.json' assert { type: "json" }

const router = new Hono();

router.get('/content/api/pages/*', async (c: Context) => {
    const contentpages = functions.getContentPages(c.req)
    return c.json(contentpages)
})

router.post('/api/v1/fortnite-br/surfaces/motd/target', async (c: Context) => {
    const motdTarget = JSON.parse(JSON.stringify(motdTargetData))

    try {
      const body = await c.req.json()
      const lang = body.language

      motdTarget.contentItems.forEach((item: any) => {
        item.contentFields.title = item.contentFields.title[lang]
        item.contentFields.body = item.contentFields.body[lang]
      })
    } catch (err) {
        error.createError(c,
            "errors.com.epicgames.common.internal_server_error",
            "Internal Server Error",
            [],
            500,
            "InternalServerError",
            500
        )
        return
    }

    return c.json(motdTarget)
})

export default router