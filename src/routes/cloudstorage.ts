import { Hono } from 'hono'
import type { Context } from 'hono'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { verifyToken } from '../tokens/tokenFunctions'
import type { Env } from '../types/env'

export const router = new Hono<Env>();

router.get('/fortnite/api/cloudstorage/system', (c) => {
  const dir = path.join(import.meta.dir, '..', '..', 'static', 'CloudStorage')
  const CloudFiles: any[] = []

  fs.readdirSync(dir).forEach(name => {
    const fullPath = path.join(dir, name)
    const stats = fs.statSync(fullPath)

    if (!stats.isFile()) return
    if (!name.toLowerCase().endsWith('.ini')) return

    const ParsedFile = fs.readFileSync(fullPath).toString()

    CloudFiles.push({
      uniqueFilename: name,
      filename: name,
      hash: crypto.createHash('sha1').update(ParsedFile).digest('hex'),
      hash256: crypto.createHash('sha256').update(ParsedFile).digest('hex'),
      length: ParsedFile.length,
      contentType: 'application/octet-stream',
      uploaded: stats.mtime,
      storageType: 'S3',
      storageIds: {},
      doNotCache: true
    })
  })

  return c.json(CloudFiles)
})

router.get('/fortnite/api/cloudstorage/system/:file', (c) => {
  const file = c.req.param('file')
  if (file.includes('..') || file.includes('~')) return c.notFound()

  const fileName = path.basename(file)
  const dir = path.join(import.meta.dir, '..', '..', 'static', 'CloudStorage')
  const filePath = path.join(dir, fileName)

  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath)
    return new Response(data)
  }

  return c.text('', 200)
})

router.get('/fortnite/api/cloudstorage/user/*/:file', verifyToken, async (c) => {
  const user = c.get('user')
  const clientSettingsPath = path.join(import.meta.dir, '..', '..', 'static', 'ClientSettings', user.accountId)
  if (!fs.existsSync(clientSettingsPath)) fs.mkdirSync(clientSettingsPath)

  const fileParam = c.req.param('file')
  if (!fileParam.toLowerCase().includes('clientsettings')) return c.text('', 200)

  const file = path.join(clientSettingsPath, 'ClientSettings.Sav')
  if (fs.existsSync(file)) {
    const data = fs.readFileSync(file)
    return new Response(data)
  }

  return c.text('', 200)
})

router.get('/fortnite/api/cloudstorage/user/:accountId', verifyToken, (c) => {
  const user = c.get('user')
  const clientSettingsPath = path.join(import.meta.dir, '..', '..', 'static', 'ClientSettings', user.accountId)
  if (!fs.existsSync(clientSettingsPath)) fs.mkdirSync(clientSettingsPath)

  const file = path.join(clientSettingsPath, 'ClientSettings.Sav')
  if (fs.existsSync(file)) {
    const ParsedFile = fs.readFileSync(file, 'latin1')
    const ParsedStats = fs.statSync(file)

    return c.json([{
      uniqueFilename: 'ClientSettings.Sav',
      filename: 'ClientSettings.Sav',
      hash: crypto.createHash('sha1').update(ParsedFile).digest('hex'),
      hash256: crypto.createHash('sha256').update(ParsedFile).digest('hex'),
      length: Buffer.byteLength(ParsedFile),
      contentType: 'application/octet-stream',
      uploaded: ParsedStats.mtime,
      storageType: 'S3',
      storageIds: {},
      accountId: user.accountId,
      doNotCache: false
    }])
  }

  return c.json([])
})

router.put('/fortnite/api/cloudstorage/user/*/:file', verifyToken, async (c) => {
  const rawBody = await getRawBody(c)
  if (Buffer.byteLength(rawBody) >= 400000) {
    return c.json({ error: 'File size must be less than 400kb.' }, 403)
  }

  const user = c.get('user')
  const clientSettingsPath = path.join(import.meta.dir, '..', '..', 'static', 'ClientSettings', user.accountId)
  if (!fs.existsSync(clientSettingsPath)) fs.mkdirSync(clientSettingsPath)

  const fileParam = c.req.param('file')
  if (!fileParam.toLowerCase().includes('clientsettings')) return c.text('', 200)

  const file = path.join(clientSettingsPath, 'ClientSettings.Sav')
  fs.writeFileSync(file, rawBody, 'latin1')

  return c.body(null, 204)
})

async function getRawBody(c: Context): Promise<string> {
  return await c.req.text()
}

export default router