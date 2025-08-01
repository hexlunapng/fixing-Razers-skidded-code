export {}

declare global {
  namespace NodeJS {
    interface Global {
      JWT_SECRET: string
      accessTokens: Array<{ accountId: string; token: string }>
      refreshTokens: Array<{ accountId: string; token: string }>
      clientTokens: Array<{ ip: string; token: string }>
      giftReceived: Record<string, boolean>
      Clients: Client[]
      MUCs: Record<string, { members: { accountId: string }[] }>
      xmppDomain: string
      kv: kv
    }
  }
}
