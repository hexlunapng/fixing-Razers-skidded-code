function getTimestamp(): string {
  const now = new Date()
  const date = now.toLocaleDateString('en-US')
  const time = now.toLocaleTimeString('en-US', { hour12: false })
  return `${date} ${time}`
}

function createLogger(prefix: string) {
  return (...args: unknown[]) => {
    const timestamp = getTimestamp()
    const prefixStr = `[${prefix}]`
    console.log(`[${timestamp}]`, prefixStr, ...args)
  }
}

export const Log = {
  Backend: createLogger('BACKEND'),
  Discord: createLogger('DISCORD'),
  XMPP: createLogger('XMPP'),
  Matchmaker: createLogger('MATCHMAKER'),
  MongoDB: createLogger('MONGODB'),
  Warning: createLogger('WARNING'),
  Error: createLogger('ERROR'),
  Debug: createLogger('DEBUG'),
  OAuth2: createLogger('OAUTH2'),
}
