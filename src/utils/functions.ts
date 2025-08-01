import fs from "fs";
import type { HonoRequest } from "hono";
import path from "path";
import { v4 as uuidv4 } from 'uuid';
import bcrypt from "bcrypt";
import User from "../models/user";
import Profile from "../models/profiles";
import Friends from "../models/friends";
import * as profileMgr from "./profile";

interface VersionInfo {
  season: number
  build: number
  CL: string
  lobby: string
}

export function GetVersionInfo(req: HonoRequest): VersionInfo {
  const memory: VersionInfo = {
    season: 0,
    build: 0.0,
    CL: "0",
    lobby: ""
  }

  const userAgent = req.header("user-agent")
  if (!userAgent) return memory

  let CL = ""

  try {
    let BuildID = userAgent.split("-")[3]?.split(",")[0]

    if (BuildID && !Number.isNaN(Number(BuildID))) {
      CL = BuildID
    } else {
      BuildID = userAgent.split("-")[3]?.split(" ")[0]

      if (BuildID && !Number.isNaN(Number(BuildID))) CL = BuildID
    }
  } catch {
    try {
      let BuildID = userAgent.split("-")[1]?.split("+")[0]

      if (BuildID && !Number.isNaN(Number(BuildID))) CL = BuildID
    } catch {}
  }

  try {
    let Build = userAgent.split("Release-")[1]?.split("-")[0] ?? ""

    if (Build.split(".").length === 3) {
      const Value = Build.split(".")
      Build = `${Value[0]}.${Value[1]}${Value[2]}`
    }

    memory.season = Number(Build.split(".")[0])
    memory.build = Number(Build)
    memory.CL = CL
    memory.lobby = `LobbySeason${memory.season}`

    if (Number.isNaN(memory.season)) throw new Error()
  } catch {
    const clNum = Number(CL)

    if (clNum < 3724489) {
      memory.season = 0
      memory.build = 0.0
      memory.CL = CL
      memory.lobby = "LobbySeason0"
    } else if (clNum <= 3790078) {
      memory.season = 1
      memory.build = 1.0
      memory.CL = CL
      memory.lobby = "LobbySeason1"
    } else {
      memory.season = 2
      memory.build = 2.0
      memory.CL = CL
      memory.lobby = "LobbyWinterDecor"
    }
  }

  return memory
}

export function getContentPages(req: HonoRequest): any {
  const memory = GetVersionInfo(req)

  const contentpagesPath = path.join(__dirname, "..", "..", "static", "responses", "contentpages.json")
  const contentpages = JSON.parse(fs.readFileSync(contentpagesPath, "utf-8"))

  let Language = "en"

  try {
    const acceptLanguage = req.header("accept-language")
    if (typeof acceptLanguage === "string") {
      if (acceptLanguage.includes("-") && acceptLanguage !== "es-419") {
        Language = acceptLanguage.split("-")[0] ?? "en"
      } else {
        Language = acceptLanguage
      }
    }
  } catch {}

  const modes = ["saveTheWorldUnowned", "battleRoyale", "creative", "saveTheWorld"]
  const news = ["savetheworldnews", "battleroyalenews"]

  try {
    modes.forEach(mode => {
      contentpages.subgameselectdata[mode].message.title = contentpages.subgameselectdata[mode].message.title[Language]
      contentpages.subgameselectdata[mode].message.body = contentpages.subgameselectdata[mode].message.body[Language]
    })
  } catch {}

  try {
    if (memory.build < 5.30) {
      news.forEach(mode => {
        contentpages[mode].news.messages[0].image = "https://cdn.discordapp.com/attachments/927739901540188200/930879507496308736/discord.png"
        contentpages[mode].news.messages[1].image = ""
      })
    }
  } catch {}

  try {
    contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = `season${memory.season}`
    contentpages.dynamicbackgrounds.backgrounds.backgrounds[1].stage = `season${memory.season}`

    if (memory.season === 10) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = "seasonx"
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[1].stage = "seasonx"
    }

    if (memory.build === 11.31 || memory.build === 11.40) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = "Winter19"
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[1].stage = "Winter19"
    }

    if (memory.build === 19.01) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = "winter2021"
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
        "https://cdn.discordapp.com/attachments/927739901540188200/930880158167085116/t-bp19-lobby-xmas-2048x1024-f85d2684b4af.png"
      contentpages.subgameinfo.battleroyale.image =
        "https://cdn.discordapp.com/attachments/927739901540188200/930880421514846268/19br-wf-subgame-select-512x1024-16d8bb0f218f.jpg"
      contentpages.specialoffervideo.bSpecialOfferEnabled = "true"
    }

    if (memory.season === 20) {
      if (memory.build === 20.40) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/t-bp20-40-armadillo-glowup-lobby-2048x2048-2048x2048-3b83b887cc7f.jpg"
      } else {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/t-bp20-lobby-2048x1024-d89eb522746c.png"
      }
    }

    if (memory.season === 21) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
        "https://cdn2.unrealengine.com/s21-lobby-background-2048x1024-2e7112b25dc3.jpg"

      if (memory.build === 21.10) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = "season2100"
      }
      if (memory.build === 21.30) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/nss-lobbybackground-2048x1024-f74a14565061.jpg"
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = "season2130"
      }
    }

    if (memory.season === 22) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
        "https://cdn2.unrealengine.com/t-bp22-lobby-square-2048x2048-2048x2048-e4e90c6e8018.jpg"
    }

    if (memory.season === 23) {
      if (memory.build === 23.10) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/t-bp23-winterfest-lobby-square-2048x2048-2048x2048-277a476e5ca6.png"
        contentpages.specialoffervideo.bSpecialOfferEnabled = "true"
      } else {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/t-bp20-lobby-2048x1024-d89eb522746c.png"
      }
    }

    if (memory.season === 24) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
        "https://cdn2.unrealengine.com/t-ch4s2-bp-lobby-4096x2048-edde08d15f7e.jpg"
    }

    if (memory.season === 25) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
        "https://cdn2.unrealengine.com/s25-lobby-4k-4096x2048-4a832928e11f.jpg"
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
        "https://cdn2.unrealengine.com/fn-shop-ch4s3-04-1920x1080-785ce1d90213.png"

      if (memory.build === 25.11) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/t-s25-14dos-lobby-4096x2048-2be24969eee3.jpg"
      }
    }

    if (memory.season === 27) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = "rufus"
    }
  } catch {}

  return contentpages
}

export function DecodeBase64(encoded: string): string {
  try {
    return Buffer.from(encoded, 'base64').toString('utf-8')
  } catch (e) {
    throw new Error('Invalid base64 string')
  }
}

export function MakeID() {
    return uuidv4().replace(/-/g, '')
}

export async function registerUser(discordId: string | null, username: string, email: string, plainPassword: string, isHost: boolean): Promise<boolean> {
  email = email.toLowerCase()

  if (!username || !email || !plainPassword) {
    throw new Error("Username, email, or password is required.")
  }

  if (discordId && await User.findOne({ discordId })) {
    throw new Error("You already created an account!")
  }

  if (await User.findOne({ email })) {
    throw new Error("Email is already in use.")
  }

  const accountId = MakeID().replace(/-/ig, "")
  const matchmakingId = MakeID().replace(/-/ig, "")

  const emailFilter = /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/
  if (!emailFilter.test(email)) throw new Error("You did not provide a valid email address.")
  if (username.length >= 25) throw new Error("Your username must be less than 25 characters long.")
  if (username.length < 3) throw new Error("Your username must be at least 3 characters long.")
  if (plainPassword.length >= 128) throw new Error("Your password must be less than 128 characters long.")
  if (plainPassword.length < 4) throw new Error("Your password must be at least 4 characters long.")

  const allowedCharacters = (
    " !\"#$%&'()*+,-./0123456789:<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~"
  ).split("")

  for (const character of username) {
    if (!allowedCharacters.includes(character)) {
      throw new Error("Your username has special characters, please remove them and try again.")
    }
  }

  const hashedPassword = await bcrypt.hash(plainPassword, 10)

  try {
    const userDoc = await User.create({
      created: new Date().toISOString(),
      discordId: discordId || null,
      accountId,
      username,
      username_lower: username.toLowerCase(),
      email,
      password: hashedPassword,
      matchmakingId,
      isServer: isHost,
      acceptedEULA: isHost
    })

    const profilesData = profileMgr.createProfiles(userDoc.accountId)

    await Profile.create({
      created: userDoc.created,
      accountId: userDoc.accountId,
      profiles: profilesData,
    })

    await Friends.create({
      created: userDoc.created,
      accountId: userDoc.accountId,
    })
  } catch (err: any) {
    if (err.code === 11000) {
      throw new Error("Username or email is already in use.")
    }
    throw new Error("An unknown error has occurred, please try again later.")
  }

  return true
}

export async function deleteUser(accountId: string) {
  if (!accountId) throw new Error("Account ID is missing")

  try {
    await User.findOneAndDelete({ accountId })
    await Profile.findOneAndDelete({ accountId })
    await Friends.findOneAndDelete({ accountId })
  } catch {
    throw new Error("An unknown error has occurred while deleting your account, please try again later.")
  }
  
  return true
}