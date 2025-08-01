import Keyv from "keyv"

class KV {
  private memkv: Keyv

  constructor() {
    this.memkv = new Keyv()
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    return await this.memkv.get(key)
  }

  async set(key: string, value: any): Promise<boolean> {
    const set = await this.memkv.set(key, value)
    return set
  }

  async setTTL(key: string, value: any, ttl: number): Promise<boolean> {
    const set = await this.memkv.set(key, value, ttl)
    return set
  }
}

export default new KV()
