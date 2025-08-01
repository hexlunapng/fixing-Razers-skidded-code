import { Hono } from 'hono'
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { Log } from './utils/logger'
import * as error from './utils/error'

const router = new Hono()

const PORT = Number(process.env.BACKEND_PORT) || 3551
const MONGO_URI = process.env.MONGO_URI!

const CERT_PATH = process.env.SSL_CERT_PATH || './certs/wow.pem'
const KEY_PATH = process.env.SSL_KEY_PATH || './certs/key.pem'

if (fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
  log.error('ssl cert or key file not found https cant be enabled');
  process.exit(1);
}
  // grrr

router.fire()

Bun.serve({
  port: PORT,
  fetch: router.fetch,
  tls: {
    cert: fs.readFileSync(CERT_PATH),
    key: fs.readFileSync(KEY_PATH),
  },
})

Log.Backend(`Backend started on port ${PORT}`)

const routesPath = path.join(__dirname, 'routes');
fs.readdirSync(routesPath).forEach(file => {
  if (file.endsWith('.ts') || file.endsWith('.js')) {
    const route = require(path.join(routesPath, file)).default;
    if (route) router.route('/', route);
  }
});

router.get('/', (c) => c.text('Aegis Backend made by Razer', 200))
router.get('/unknown', (c) => c.json({ message: "Aegis Backend made by Razer" }, 200))
router.use('*', async (c) => {
  return error.createError(c,
    'errors.com.epicgames.common.not_found',
    'Sorry the resource you were trying to find could not be found',
    [],
    1004,
    undefined,
    404
  )
})

try {
  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  })
  Log.MongoDB(`Connection to ${MONGO_URI} successfully established.`)
} catch (err) {
  Log.Error('MongoDB connection failed: ' + (err as Error).message);
  process.exit(1);
}

await import('./ws/xmpp/xmpp')
await import('./ws/matchmaker/matchmaker')
import "./bot/bot"
