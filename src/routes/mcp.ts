import { Hono } from "hono";
import fs from 'fs'
import path from 'path'
import Profile from "../models/profiles";
import { verifyToken } from "../tokens/tokenFunctions";
import * as error from "../utils/error";
import * as profileMgr from "../utils/profile";
import * as functions from "../utils/functions";
import type { Env } from "../types/env";
import * as itemShop from "../utils/itemshop";
import * as xmpp from '../ws/xmpp/xmppFunctions'
import { handleBattlePassLevelUp, handleBattlePassPurchase, handleCatalogPurchase } from "../utils/purchasehandler";
import Friends from "../models/friends";
import variantsData from '../../static/ItemShop/variants.json'

const router = new Hono<Env>();

declare namespace NodeJS {
  interface Global {
    giftReceived: Record<string, boolean>;
  }
}

const g = global as unknown as NodeJS.Global;
if (!g.giftReceived) {
  g.giftReceived = {};
}

router.post('/fortnite/api/game/v2/profile/*/client/EquipBattleRoyaleCustomization', verifyToken, async (c) => {
  const accountId = c.get('user').accountId
  const profileId = c.req.query('profileId') || ''
  const rvnQuery = Number(c.req.query('rvn') ?? -1)
  const body = await c.req.json<{
    slotName: string
    itemToSlot: string
    indexWithinSlot?: number
    variantUpdates?: any[]
  }>()

  const profiles = await Profile.findOne({ accountId })
  if (!profiles || !await profileMgr.validateProfile(profileId, profiles)) {
    return error.createError(c,
      "errors.com.epicgames.modules.profiles.operation_forbidden",
      `Unable to find template configuration for profile ${profileId}`,
      [profileId], 12813, undefined, 403
    )
  }

  if (profileId !== "athena") {
    return error.createError(c,
      "errors.com.epicgames.modules.profiles.invalid_command",
      `EquipBattleRoyaleCustomization is not valid on ${profileId} profile`,
      ["EquipBattleRoyaleCustomization", profileId], 12801, undefined, 400
    )
  }

  const profile = (profiles?.profiles as any)[profileId]
  const memory = functions.GetVersionInfo(c.req)

  if (profileId === "athena") {
    profile.stats.attributes.season_num = memory.season
  }

  let ApplyProfileChanges: any[] = []
  const BaseRevision = profile.rvn
  const ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn

  const specialCosmetics = [
    "AthenaCharacter:cid_random",
    "AthenaBackpack:bid_random",
    "AthenaPickaxe:pickaxe_random",
    "AthenaGlider:glider_random",
    "AthenaSkyDiveContrail:trails_random",
    "AthenaItemWrap:wrap_random",
    "AthenaMusicPack:musicpack_random",
    "AthenaLoadingScreen:lsid_random"
  ]

  const missingFields = getMissingFields(["slotName"], body)
  if (missingFields.fields.length > 0) {
    return error.createError(c,
      "errors.com.epicgames.validation.validation_failed",
      `Validation Failed. [${missingFields.fields.join(", ")}] field(s) is missing.`,
      [`[${missingFields.fields.join(", ")}]`], 1040, undefined, 400
    )
  }

  if (typeof body.itemToSlot !== "string") {
    return error.createError(c,
      "errors.com.epicgames.validation.validation_failed",
      "Validation Failed itemToSlot is not a string.",
      ["itemToSlot"], 1040, undefined, 400,
    )
  }
  if (typeof body.slotName !== "string") {
    return error.createError(c,
      "errors.com.epicgames.validation.validation_failed",
      "Validation Failed slotName is not a string.",
      ["slotName"], 1040, undefined, 400,
    )
  }

  if (!profile.items) profile.items = {}

  if (!profile.items[body.itemToSlot] && body.itemToSlot) {
    const item = body.itemToSlot

    if (!specialCosmetics.includes(item)) {
      return error.createError(c,
        "errors.com.epicgames.fortnite.id_invalid",
        `Item (id: '${body.itemToSlot}') not found`,
        [body.itemToSlot], 16027, undefined, 400,
      )
    } else {
      if (!item.startsWith(`Athena${body.slotName}:`)) {
        return error.createError(c,
          "errors.com.epicgames.fortnite.id_invalid",
          `Cannot slot item of type ${item.split(":")[0]} in slot of category ${body.slotName}`,
          [item.split(":")[0], body.slotName], 16027, undefined, 400
        )
      }
    }
  }

  if (profile.items[body.itemToSlot]) {
    const templateId = profile.items[body.itemToSlot].templateId
    if (!templateId.startsWith(`Athena${body.slotName}:`)) {
      return error.createError(c,
        "errors.com.epicgames.fortnite.id_invalid",
        `Cannot slot item of type ${templateId.split(":")[0]} in slot of category ${body.slotName}`,
        [templateId.split(":")[0], body.slotName], 16027, undefined, 400
      )
    }

    const Variants = body.variantUpdates
    if (Array.isArray(Variants)) {
      for (const variant of Variants) {
        if (typeof variant !== "object" || !variant.channel || !variant.active) continue

        const index = profile.items[body.itemToSlot].attributes.variants.findIndex((x: any) => x.channel === variant.channel)
        if (index === -1) continue
        if (!profile.items[body.itemToSlot].attributes.variants[index].owned.includes(variant.active)) continue

        profile.items[body.itemToSlot].attributes.variants[index].active = variant.active
      }

      ApplyProfileChanges.push({
        changeType: "itemAttrChanged",
        itemId: body.itemToSlot,
        attributeName: "variants",
        attributeValue: profile.items[body.itemToSlot].attributes.variants
      })
    }
  }

  const slotNames = ["Character", "Backpack", "Pickaxe", "Glider", "SkyDiveContrail", "MusicPack", "LoadingScreen"]
  const activeLoadoutId = profile.stats.attributes.loadouts[profile.stats.attributes.active_loadout_index]
  const templateId = profile.items[body.itemToSlot] ? profile.items[body.itemToSlot].templateId : body.itemToSlot

  switch (body.slotName) {
    case "Dance":
      if (!profile.items[activeLoadoutId].attributes.locker_slots_data.slots[body.slotName]) break
      if (typeof body.indexWithinSlot !== "number") {
        return error.createError(c,
          "errors.com.epicgames.validation.validation_failed",
          "Validation Failed indexWithinSlot is not a number.",
          ["indexWithinSlot"], 1040, undefined, 400,
        )
      }

      if (body.indexWithinSlot >= 0 && body.indexWithinSlot <= 5) {
        profile.stats.attributes.favorite_dance[body.indexWithinSlot] = body.itemToSlot
        profile.items[activeLoadoutId].attributes.locker_slots_data.slots.Dance.items[body.indexWithinSlot] = templateId

        ApplyProfileChanges.push({
          changeType: "statModified",
          name: "favorite_dance",
          value: profile.stats.attributes.favorite_dance
        })
      }
      break

    case "ItemWrap":
      if (!profile.items[activeLoadoutId].attributes.locker_slots_data.slots[body.slotName]) break
      if (typeof body.indexWithinSlot !== "number") {
        return error.createError(c,
          "errors.com.epicgames.validation.validation_failed",
          "Validation Failed indexWithinSlot is not a number.",
          ["indexWithinSlot"], 1040, undefined, 400,
        )
      }

      if (body.indexWithinSlot >= 0 && body.indexWithinSlot <= 7) {
        profile.stats.attributes.favorite_itemwraps[body.indexWithinSlot] = body.itemToSlot
        profile.items[activeLoadoutId].attributes.locker_slots_data.slots.ItemWrap.items[body.indexWithinSlot] = templateId
        ApplyProfileChanges.push({
          changeType: "statModified",
          name: "favorite_itemwraps",
          value: profile.stats.attributes.favorite_itemwraps
        })
      } else if (body.indexWithinSlot === -1) {
        for (let i = 0; i < 7; i++) {
          profile.stats.attributes.favorite_itemwraps[i] = body.itemToSlot
          profile.items[activeLoadoutId].attributes.locker_slots_data.slots.ItemWrap.items[i] = templateId
        }
        ApplyProfileChanges.push({
          changeType: "statModified",
          name: "favorite_itemwraps",
          value: profile.stats.attributes.favorite_itemwraps
        })
      }
      break

    default:
      if (!slotNames.includes(body.slotName)) break
      if (!profile.items[activeLoadoutId].attributes.locker_slots_data.slots[body.slotName]) break

      if (body.slotName === "Pickaxe" || body.slotName === "Glider") {
        if (!body.itemToSlot) {
          return error.createError(c,
            "errors.com.epicgames.fortnite.id_invalid",
            `${body.slotName} can not be empty.`,
            [body.slotName], 16027, undefined, 400
          )
        }
      }

      const favKey = (`favorite_${body.slotName}`).toLowerCase()
      profile.stats.attributes[favKey] = body.itemToSlot
      profile.items[activeLoadoutId].attributes.locker_slots_data.slots[body.slotName].items = [templateId]

      ApplyProfileChanges.push({
        changeType: "statModified",
        name: favKey,
        value: profile.stats.attributes[favKey]
      })
      break
  }

  if (ApplyProfileChanges.length > 0) {
    profile.rvn += 1
    profile.commandRevision += 1
    profile.updated = new Date().toISOString()
    await profiles.updateOne({ $set: { [`profiles.${profileId}`]: profile } })
  }

  if (rvnQuery !== ProfileRevisionCheck) {
    ApplyProfileChanges = [{
      changeType: "fullProfileUpdate",
      profile
    }]
  }

  return c.json({
    profileRevision: profile.rvn || 0,
    profileId,
    profileChangesBaseRevision: BaseRevision,
    profileChanges: ApplyProfileChanges,
    profileCommandRevision: profile.commandRevision || 0,
    serverTime: new Date().toISOString(),
    responseVersion: 1
  })
})

router.post('/fortnite/api/game/v2/profile/*/client/MarkItemSeen', verifyToken, async (c) => {
  const accountId = c.get('user').accountId
  const profileId = c.req.query('profileId') || ''
  const rvnQuery = Number(c.req.query('rvn') ?? -1)

  const body = await c.req.json<{
    itemIds: string[]
  }>()

  const profiles = await Profile.findOne({ accountId })

  if (!profiles || !await profileMgr.validateProfile(profileId, profiles)) {
    return error.createError(c,
      "errors.com.epicgames.modules.profiles.operation_forbidden",
      `Unable to find template configuration for profile ${profileId}`,
      [profileId], 12813, undefined, 403
    )
  }

  let profile = (profiles.profiles as any)[profileId]

  const memory = functions.GetVersionInfo(c.req)

  if (profileId === "athena") {
    profile.stats.attributes.season_num = memory.season
  }

  let ApplyProfileChanges: any[] = []
  const BaseRevision = profile.rvn
  const ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn

  const missingFields = getMissingFields(["itemIds"], body)
  if (missingFields.fields.length > 0) {
    return error.createError(c,
      "errors.com.epicgames.validation.validation_failed",
      `Validation Failed. [${missingFields.fields.join(", ")}] field(s) is missing.`,
      [`[${missingFields.fields.join(", ")}]`], 1040, undefined, 400
    )
  }

  if (!Array.isArray(body.itemIds)) {
    return error.createError(c,
      "errors.com.epicgames.validation.validation_failed",
      "Validation Failed itemToSlot is not a string.",
      ["itemToSlot"], 1040, undefined, 400,
    )
  }

  if (!profile.items) profile.items = {}

  for (const itemId of body.itemIds) {
    if (!profile.items[itemId]) continue

    profile.items[itemId].attributes.item_seen = true

    ApplyProfileChanges.push({
      changeType: "itemAttrChanged",
      itemId: itemId,
      attributeName: "item_seen",
      attributeValue: true
    })
  }

  if (ApplyProfileChanges.length > 0) {
    profile.rvn += 1
    profile.commandRevision += 1
    profile.updated = new Date().toISOString()

    await profiles.updateOne({ $set: { [`profiles.${profileId}`]: profile } })
  }

  if (rvnQuery !== ProfileRevisionCheck) {
    ApplyProfileChanges = [{
      changeType: "fullProfileUpdate",
      profile
    }]
  }

  return c.json({
    profileRevision: profile.rvn || 0,
    profileId,
    profileChangesBaseRevision: BaseRevision,
    profileChanges: ApplyProfileChanges,
    profileCommandRevision: profile.commandRevision || 0,
    serverTime: new Date().toISOString(),
    responseVersion: 1
  })
})

router.post('/fortnite/api/game/v2/profile/*/client/SetBattleRoyaleBanner', verifyToken, async (c) => {
  const accountId = c.get('user').accountId
  const profileId = c.req.query('profileId') || ''
  const rvnQuery = Number(c.req.query('rvn') ?? -1)

  const body = await c.req.json<{
    homebaseBannerIconId: string
    homebaseBannerColorId: string
  }>()

  const profiles = await Profile.findOne({ accountId })

  if (!profiles || !await profileMgr.validateProfile(profileId, profiles)) {
    return error.createError(
      c,
      "errors.com.epicgames.modules.profiles.operation_forbidden",
      `Unable to find template configuration for profile ${profileId}`,
      [profileId], 12813, undefined, 403
    )
  }

  if (profileId !== "athena") {
    return error.createError(
      c,
      "errors.com.epicgames.modules.profiles.invalid_command",
      `SetBattleRoyaleBanner is not valid on ${profileId} profile`,
      ["SetBattleRoyaleBanner", profileId], 12801, undefined, 400
    )
  }

  let profile = (profiles.profiles as any)[profileId]
  const memory = functions.GetVersionInfo(c.req)

  if (profileId === "athena") {
    profile.stats.attributes.season_num = memory.season
  }

  let ApplyProfileChanges: any[] = []
  const BaseRevision = profile.rvn
  const ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn

  const missingFields = getMissingFields(["homebaseBannerIconId", "homebaseBannerColorId"], body)
  if (missingFields.fields.length > 0) {
    return error.createError(
      c,
      "errors.com.epicgames.validation.validation_failed",
      `Validation Failed. [${missingFields.fields.join(", ")}] field(s) is missing.`,
      [`[${missingFields.fields.join(", ")}]`], 1040, undefined, 400
    )
  }

  if (typeof body.homebaseBannerIconId !== "string") {
    return error.createError(
      c,
      "errors.com.epicgames.validation.validation_failed",
      "Validation Failed homebaseBannerIconId is not a string.",
      ["homebaseBannerIconId"], 1040, undefined, 400
    )
  }

  if (typeof body.homebaseBannerColorId !== "string") {
    return error.createError(
      c,
      "errors.com.epicgames.validation.validation_failed",
      "Validation Failed homebaseBannerColorId is not a string.",
      ["homebaseBannerColorId"], 1040, undefined, 400
    )
  }

  const bannerProfileId = memory.build < 3.5 ? "profile0" : "common_core"
  let bannerProfile = (profiles.profiles as any)[bannerProfileId]
  if (!bannerProfile.items) {
    bannerProfile.items = {}
  }

  let HomebaseBannerIconID = ""
  let HomebaseBannerColorID = ""

  for (const itemId in bannerProfile.items) {
    const templateId = bannerProfile.items[itemId].templateId

    if (templateId.toLowerCase() === `HomebaseBannerIcon:${body.homebaseBannerIconId}`.toLowerCase()) {
      HomebaseBannerIconID = itemId
    }
    if (templateId.toLowerCase() === `HomebaseBannerColor:${body.homebaseBannerColorId}`.toLowerCase()) {
      HomebaseBannerColorID = itemId
    }

    if (HomebaseBannerIconID && HomebaseBannerColorID) break
  }

  if (!HomebaseBannerIconID) {
    return error.createError(
      c,
      "errors.com.epicgames.fortnite.item_not_found",
      `Banner template 'HomebaseBannerIcon:${body.homebaseBannerIconId}' not found in profile`,
      [`HomebaseBannerIcon:${body.homebaseBannerIconId}`], 16006, undefined, 400
    )
  }

  if (!HomebaseBannerColorID) {
    return error.createError(
      c,
      "errors.com.epicgames.fortnite.item_not_found",
      `Banner template 'HomebaseBannerColor:${body.homebaseBannerColorId}' not found in profile`,
      [`HomebaseBannerColor:${body.homebaseBannerColorId}`], 16006, undefined, 400
    )
  }

  if (!profile.items) profile.items = {}

  const activeLoadoutId = profile.stats.attributes.loadouts[profile.stats.attributes.active_loadout_index]

  profile.stats.attributes.banner_icon = body.homebaseBannerIconId
  profile.stats.attributes.banner_color = body.homebaseBannerColorId

  profile.items[activeLoadoutId].attributes.banner_icon_template = body.homebaseBannerIconId
  profile.items[activeLoadoutId].attributes.banner_color_template = body.homebaseBannerColorId

  ApplyProfileChanges.push({
    changeType: "statModified",
    name: "banner_icon",
    value: profile.stats.attributes.banner_icon
  })

  ApplyProfileChanges.push({
    changeType: "statModified",
    name: "banner_color",
    value: profile.stats.attributes.banner_color
  })

  if (ApplyProfileChanges.length > 0) {
    profile.rvn += 1
    profile.commandRevision += 1
    profile.updated = new Date().toISOString()

    await profiles.updateOne({ $set: { [`profiles.${profileId}`]: profile } })
  }

  if (rvnQuery !== ProfileRevisionCheck) {
    ApplyProfileChanges = [{
      changeType: "fullProfileUpdate",
      profile
    }]
  }

  return c.json({
    profileRevision: profile.rvn || 0,
    profileId,
    profileChangesBaseRevision: BaseRevision,
    profileChanges: ApplyProfileChanges,
    profileCommandRevision: profile.commandRevision || 0,
    serverTime: new Date().toISOString(),
    responseVersion: 1
  })
})

router.post('/fortnite/api/game/v2/profile/*/client/SetItemFavoriteStatusBatch', verifyToken, async (c) => {
  const accountId = c.get('user').accountId
  const profileId = c.req.query('profileId') || ''
  const rvnQuery = Number(c.req.query('rvn') ?? -1)

  const body = await c.req.json<{
    itemIds: string[]
    itemFavStatus: boolean[]
  }>()

  const profiles = await Profile.findOne({ accountId })

  if (!profiles || !await profileMgr.validateProfile(profileId, profiles)) {
    return error.createError(
      c,
      "errors.com.epicgames.modules.profiles.operation_forbidden",
      `Unable to find template configuration for profile ${profileId}`,
      [profileId], 12813, undefined, 403
    )
  }

  if (profileId !== "athena") {
    return error.createError(
      c,
      "errors.com.epicgames.modules.profiles.invalid_command",
      `SetItemFavoriteStatusBatch is not valid on ${profileId} profile`,
      ["SetItemFavoriteStatusBatch", profileId], 12801, undefined, 400
    )
  }

  let profile = (profiles.profiles as any)[profileId]

  const memory = functions.GetVersionInfo(c.req)

  if (profileId === "athena") {
    profile.stats.attributes.season_num = memory.season
  }

  let ApplyProfileChanges: any[] = []
  const BaseRevision = profile.rvn
  const ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn

  const missingFields = getMissingFields(["itemIds", "itemFavStatus"], body)
  if (missingFields.fields.length > 0) {
    return error.createError(
      c,
      "errors.com.epicgames.validation.validation_failed",
      `Validation Failed. [${missingFields.fields.join(", ")}] field(s) is missing.`,
      [`[${missingFields.fields.join(", ")}]`], 1040, undefined, 400
    )
  }

  if (!Array.isArray(body.itemIds)) {
    return error.createError(
      c,
      "errors.com.epicgames.validation.validation_failed",
      "Validation Failed itemIds is not an array.",
      ["itemIds"], 1040, undefined, 400
    )
  }

  if (!Array.isArray(body.itemFavStatus)) {
    return error.createError(
      c,
      "errors.com.epicgames.validation.validation_failed",
      "Validation Failed itemFavStatus is not an array.",
      ["itemFavStatus"], 1040, undefined, 400
    )
  }

  if (!profile.items) profile.items = {}

  for (let i = 0; i < body.itemIds.length; i++) {
    const itemId = body.itemIds[i]
    const favStatus = body.itemFavStatus[i]

    if (!itemId) continue 
    if (!profile.items[itemId]) continue
    if (typeof favStatus !== "boolean") continue

    profile.items[itemId].attributes.favorite = favStatus

    ApplyProfileChanges.push({
      changeType: "itemAttrChanged",
      itemId: itemId,
      attributeName: "favorite",
      attributeValue: favStatus
    })
  }

  if (ApplyProfileChanges.length > 0) {
    profile.rvn += 1
    profile.commandRevision += 1
    profile.updated = new Date().toISOString()

    await profiles.updateOne({ $set: { [`profiles.${profileId}`]: profile } })
  }

  if (rvnQuery !== ProfileRevisionCheck) {
    ApplyProfileChanges = [{
      changeType: "fullProfileUpdate",
      profile
    }]
  }

  return c.json({
    profileRevision: profile.rvn || 0,
    profileId,
    profileChangesBaseRevision: BaseRevision,
    profileChanges: ApplyProfileChanges,
    profileCommandRevision: profile.commandRevision || 0,
    serverTime: new Date().toISOString(),
    responseVersion: 1
  })
})

router.post('/fortnite/api/game/v2/profile/*/client/RemoveGiftBox', verifyToken, async (c) => {
  const accountId = c.get('user').accountId
  const profileId = c.req.query('profileId')
  const rvnQuery = Number(c.req.query('rvn') ?? -1)

  if (!profileId) {
    return error.createError(
      c,
      "errors.com.epicgames.validation.validation_failed",
      "Validation Failed profileId is missing.",
      ["profileId"], 1040, undefined, 400
    )
  }

  const profiles = await Profile.findOne({ accountId })

  if (!profiles || !await profileMgr.validateProfile(profileId, profiles)) {
    return error.createError(
      c,
      "errors.com.epicgames.modules.profiles.operation_forbidden",
      `Unable to find template configuration for profile ${profileId}`,
      [profileId], 12813, undefined, 403
    )
  }

  let profile = (profiles.profiles as Record<string, any>)[profileId]

  if (profileId !== "athena" && profileId !== "common_core" && profileId !== "profile0") {
    return error.createError(
      c,
      "errors.com.epicgames.modules.profiles.invalid_command",
      `RemoveGiftBox is not valid on ${profileId} profile`,
      ["RemoveGiftBox", profileId], 12801, undefined, 400
    )
  }

  const body = await c.req.json<{
    giftBoxItemId?: string
    giftBoxItemIds?: string[]
  }>()

  const memory = functions.GetVersionInfo(c.req)

  let ApplyProfileChanges: any[] = []
  const BaseRevision = profile.rvn
  const ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn

  if (typeof body.giftBoxItemId === "string") {
    const giftBoxItemId = body.giftBoxItemId

    if (!profile.items[giftBoxItemId]) {
      return error.createError(
        c,
        "errors.com.epicgames.fortnite.id_invalid",
        `Item (id: '${giftBoxItemId}') not found`,
        [giftBoxItemId], 16027, undefined, 400
      )
    }

    if (!profile.items[giftBoxItemId].templateId.startsWith("GiftBox:")) {
      return error.createError(
        c,
        "errors.com.epicgames.fortnite.id_invalid",
        "The specified item id is not a giftbox.",
        [giftBoxItemId], 16027, undefined, 400
      )
    }

    delete profile.items[giftBoxItemId]

    ApplyProfileChanges.push({
      changeType: "itemRemoved",
      itemId: giftBoxItemId
    })
  }

  if (Array.isArray(body.giftBoxItemIds)) {
    for (const giftBoxItemId of body.giftBoxItemIds) {
      if (typeof giftBoxItemId !== "string") continue
      if (!profile.items[giftBoxItemId]) continue
      if (!profile.items[giftBoxItemId].templateId.startsWith("GiftBox:")) continue

      delete profile.items[giftBoxItemId]

      ApplyProfileChanges.push({
        changeType: "itemRemoved",
        itemId: giftBoxItemId
      })
    }
  }

  if (ApplyProfileChanges.length > 0) {
    profile.rvn += 1
    profile.commandRevision += 1
    profile.updated = new Date().toISOString()

    await profiles.updateOne({ $set: { [`profiles.${profileId}`]: profile } })
  }

  if (rvnQuery !== ProfileRevisionCheck) {
    ApplyProfileChanges = [{
      changeType: "fullProfileUpdate",
      profile
    }]
  }

  return c.json({
    profileRevision: profile.rvn || 0,
    profileId,
    profileChangesBaseRevision: BaseRevision,
    profileChanges: ApplyProfileChanges,
    profileCommandRevision: profile.commandRevision || 0,
    serverTime: new Date().toISOString(),
    responseVersion: 1
  })
})

router.post('/fortnite/api/game/v2/profile/*/client/RefundMtxPurchase', verifyToken, async (c) => {
  const accountId = c.get('user').accountId
  const profileId = c.req.query('profileId')
  const rvnQuery = Number(c.req.query('rvn') ?? -1)

  if (!profileId) {
    return error.createError(
      c,
      "errors.com.epicgames.validation.validation_failed",
      "Validation Failed profileId is missing.",
      ["profileId"], 1040, undefined, 400
    )
  }

  const profiles = await Profile.findOne({ accountId })

  if (!profiles || !await profileMgr.validateProfile(profileId, profiles)) {
    return error.createError(
      c,
      "errors.com.epicgames.modules.profiles.operation_forbidden",
      `Unable to find template configuration for profile ${profileId}`,
      [profileId], 12813, undefined, 403
    )
  }

  let profile = (profiles.profiles as Record<string, any>)[profileId]
  let ItemProfile = (profiles.profiles as Record<string, any>)["athena"]

  const body = await c.req.json<{ purchaseId?: string }>()
  const memory = functions.GetVersionInfo(c.req)

  let ApplyProfileChanges: any[] = []
  let MultiUpdate: any[] = []
  const BaseRevision = profile.rvn || 0
  const ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn
  let ItemGuids: string[] = []

  if (body.purchaseId) {
    MultiUpdate.push({
      profileRevision: ItemProfile.rvn || 0,
      profileId: "athena",
      profileChangesBaseRevision: ItemProfile.rvn || 0,
      profileChanges: [],
      profileCommandRevision: ItemProfile.commandRevision || 0,
    })

    profile.stats.attributes.mtx_purchase_history.refundsUsed += 1
    profile.stats.attributes.mtx_purchase_history.refundCredits -= 1

    for (const purchase of profile.stats.attributes.mtx_purchase_history.purchases) {
      if (purchase.purchaseId === body.purchaseId) {
        for (const loot of purchase.lootResult) {
          ItemGuids.push(loot.itemGuid)
        }

        purchase.refundDate = new Date().toISOString()

        for (const key in profile.items) {
          const item = profile.items[key]
          if (item.templateId.toLowerCase().startsWith("currency:mtx")) {
            const platform = item.attributes.platform.toLowerCase()
            const current = profile.stats.attributes.current_mtx_platform.toLowerCase()

            if (platform === current || platform === "shared") {
              item.quantity += purchase.totalMtxPaid

              ApplyProfileChanges.push({
                changeType: "itemQuantityChanged",
                itemId: key,
                quantity: item.quantity
              })

              break
            }
          }
        }
      }
    }

    for (const guid of ItemGuids) {
      try {
        delete ItemProfile.items[guid]
        MultiUpdate[0].profileChanges.push({
          changeType: "itemRemoved",
          itemId: guid
        })
      } catch {}
    }

    ItemProfile.rvn += 1
    ItemProfile.commandRevision += 1
    profile.rvn += 1
    profile.commandRevision += 1
  }

  if (ApplyProfileChanges.length > 0) {
    ApplyProfileChanges.push({
      changeType: "statModified",
      name: "mtx_purchase_history",
      value: profile.stats.attributes.mtx_purchase_history
    })

    MultiUpdate[0].profileRevision = ItemProfile.rvn || 0
    MultiUpdate[0].profileCommandRevision = ItemProfile.commandRevision || 0

    await profiles.updateOne({
      $set: {
        [`profiles.${profileId}`]: profile,
        [`profiles.athena`]: ItemProfile
      }
    })
  }

  let responseChanges = ApplyProfileChanges
  if (rvnQuery !== ProfileRevisionCheck) {
    responseChanges = [{
      changeType: "fullProfileUpdate",
      profile
    }]
  }

  return c.json({
    profileRevision: profile.rvn || 0,
    profileId,
    profileChangesBaseRevision: BaseRevision,
    profileChanges: responseChanges,
    profileCommandRevision: profile.commandRevision || 0,
    serverTime: new Date().toISOString(),
    multiUpdate: MultiUpdate,
    responseVersion: 1
  })
})

router.post('/fortnite/api/game/v2/profile/*/client/PurchaseCatalogEntry', verifyToken, async (c) => {
  const accountId = c.get('user').accountId
  const profiles: any = await Profile.findOne({ accountId })

  const profileId = c.req.query('profileId') ?? ''
  if (!profiles || !await profileMgr.validateProfile(profileId, profiles)) {
    return error.createError(
      c,
      'errors.com.epicgames.modules.profiles.operation_forbidden',
      `Unable to find template configuration for profile ${profileId}`,
      [profileId],
      12813,
      undefined,
      403
    )
  }

  let profile = profiles.profiles[profileId]
  let athena = profiles.profiles['athena']

  if (profileId !== 'common_core' && profileId !== 'profile0') {
    return error.createError(
      c,
      'errors.com.epicgames.modules.profiles.invalid_command',
      `PurchaseCatalogEntry is not valid on ${profileId} profile`,
      ['PurchaseCatalogEntry', profileId],
      12801,
      undefined,
      400
    )
  }

  let MultiUpdate = [{
    profileRevision: athena.rvn || 0,
    profileId: 'athena',
    profileChangesBaseRevision: athena.rvn || 0,
    profileChanges: [],
    profileCommandRevision: athena.commandRevision || 0
  }]

  const memory = functions.GetVersionInfo(c.req)
  let Notifications: any[] = []
  let ApplyProfileChanges: any[] = []
  let BaseRevision = profile.rvn
  let ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn
  let QueryRevision = parseInt(c.req.query('rvn') || '-1')

  const body = await c.req.json()
  let missingFields = getMissingFields(['offerId'], body)
  if (missingFields.fields.length > 0) {
    return error.createError(
      c,
      'errors.com.epicgames.validation.validation_failed',
      `Validation Failed. [${missingFields.fields.join(', ')}] field(s) is missing.`,
      [`[${missingFields.fields.join(', ')}]`],
      1040,
      undefined,
      400
    )
  }

  if (typeof body.offerId !== 'string') {
    return error.createError(
      c,
      'errors.com.epicgames.validation.validation_failed',
      `'offerId' must be a string.`,
      ['offerId'],
      1040,
      undefined,
      400
    )
  }

  if (typeof body.purchaseQuantity !== 'number') {
    return error.createError(
      c,
      'errors.com.epicgames.validation.validation_failed',
      `'purchaseQuantity' must be a number.`,
      ['purchaseQuantity'],
      1040,
      undefined,
      400
    )
  }

  if (body.purchaseQuantity < 1) {
    return error.createError(
      c,
      'errors.com.epicgames.validation.validation_failed',
      `'purchaseQuantity' is less than 1.`,
      ['purchaseQuantity'],
      1040,
      undefined,
      400
    )
  }

  if (!profile.items) profile.items = {}
  if (!athena.items) athena.items = {}

  let findOfferId = await itemShop.getOfferID(body.offerId)
  if (!findOfferId) {
    return error.createError(
      c,
      'errors.com.epicgames.fortnite.id_invalid',
      `Offer ID (id: '${body.offerId}') not found`,
      [body.offerId],
      16027,
      undefined,
      400
    )
  }

  const season = `Season${memory.season}`
  const seasonNumber = memory.season
  const battlePassPath = path.join(__dirname, '../../static/BattlePasses/', `${season}.json`)

  if (fs.existsSync(battlePassPath)) {
    const BattlePass = JSON.parse(fs.readFileSync(battlePassPath, 'utf8'))
    const offerId = body.offerId
    const purchaseQuantity = body.purchaseQuantity || 1
    const totalPrice = (findOfferId?.offerId?.prices?.[0]?.finalPrice ?? 0) * purchaseQuantity

    if (offerId === BattlePass.battlePassOfferId || offerId === BattlePass.battleBundleOfferId || offerId === BattlePass.tierOfferId) {
      if (findOfferId?.offerId?.prices?.[0]?.currencyType?.toLowerCase() === 'mtxcurrency') {
        let paid = false
        for (let key in profile.items) {
          if (!profile.items[key].templateId.toLowerCase().startsWith('currency:mtx')) continue
          let currencyPlatform = profile.items[key].attributes.platform
          if ((currencyPlatform.toLowerCase() !== profile.stats.attributes.current_mtx_platform.toLowerCase()) && (currencyPlatform.toLowerCase() !== 'shared')) continue
          if (profile.items[key].quantity < totalPrice) {
            return error.createError(
              c,
              'errors.com.epicgames.currency.mtx.insufficient',
              `You cannot afford this item (${totalPrice}), you only have ${profile.items[key].quantity}.`,
              [`${totalPrice}`, `${profile.items[key].quantity}`],
              1040,
              undefined,
              400
            )
          }

          profile.items[key].quantity -= totalPrice
          ApplyProfileChanges.push({
            changeType: 'itemQuantityChanged',
            itemId: key,
            quantity: profile.items[key].quantity
          })
          paid = true
          break
        }
        if (!paid && totalPrice > 0) {
          return error.createError(
            c,
            'errors.com.epicgames.currency.mtx.insufficient',
            `You cannot afford this item (${totalPrice}).`,
            [`${totalPrice}`],
            1040,
            undefined,
            400
          )
        }
      }

      if (offerId === BattlePass.battlePassOfferId || offerId === BattlePass.battleBundleOfferId) {
        await handleBattlePassPurchase(athena, profile, profiles, BattlePass, offerId, seasonNumber, ApplyProfileChanges, MultiUpdate)
      }

      if (offerId === BattlePass.tierOfferId) {
        await handleBattlePassLevelUp(athena, profile, BattlePass, body, ApplyProfileChanges, MultiUpdate)
      }

      if (MultiUpdate[0]!.profileChanges!.length > 0) {
        athena.rvn++
        athena.commandRevision++
        athena.updated = new Date().toISOString()
        MultiUpdate[0]!.profileRevision = athena.rvn
        MultiUpdate[0]!.profileCommandRevision = athena.commandRevision
      }

      if (ApplyProfileChanges.length > 0) {
        profile.rvn++
        profile.commandRevision++
        profile.updated = new Date().toISOString()
        await profiles.updateOne({
          $set: {
            [`profiles.${profileId}`]: profile,
            [`profiles.athena`]: athena
          }
        })
      }

      if (QueryRevision !== ProfileRevisionCheck) {
        ApplyProfileChanges = [{
          changeType: 'fullProfileUpdate',
          profile
        }]
      }

      return c.json({
        profileRevision: profile.rvn || 0,
        profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        notifications: Notifications,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        multiUpdate: MultiUpdate,
        responseVersion: 1
      })
    }
  }

  switch (true) {
    case /^BR(Daily|Weekly|Season)Storefront$/.test(findOfferId.name):
      await handleCatalogPurchase(athena, profile, findOfferId, ApplyProfileChanges, MultiUpdate, Notifications, error, c)
      break
  }

  if (MultiUpdate[0]!.profileChanges.length > 0) {
    athena.rvn++
    athena.commandRevision++
    athena.updated = new Date().toISOString()
    MultiUpdate[0]!.profileRevision = athena.rvn
    MultiUpdate[0]!.profileCommandRevision = athena.commandRevision
  }

  if (ApplyProfileChanges.length > 0) {
    profile.rvn++
    profile.commandRevision++
    profile.updated = new Date().toISOString()
    await profiles.updateOne({
      $set: {
        [`profiles.${profileId}`]: profile,
        [`profiles.athena`]: athena
      }
    })
  }

  if (QueryRevision !== ProfileRevisionCheck) {
    ApplyProfileChanges = [{
      changeType: 'fullProfileUpdate',
      profile
    }]
  }

  return c.json({
    profileRevision: profile.rvn || 0,
    profileId,
    profileChangesBaseRevision: BaseRevision,
    profileChanges: ApplyProfileChanges,
    notifications: Notifications,
    profileCommandRevision: profile.commandRevision || 0,
    serverTime: new Date().toISOString(),
    multiUpdate: MultiUpdate,
    responseVersion: 1
  })
})

router.post('/fortnite/api/game/v2/profile/*/client/GiftCatalogEntry', verifyToken, async (c) => {
  const user = c.get('user')
  if (!user?.accountId) {
    return error.createError(
      c,
      'errors.com.epicgames.common.unauthorized',
      'Unauthorized',
      [],
      401,
      undefined,
      401
    )
  }

  const query = c.req.query()
  const profileId = query.profileId

  let body: any
  try {
    body = await c.req.json()
  } catch {
    return error.createError(
      c,
      'errors.com.epicgames.validation.invalid_json',
      'Invalid JSON body',
      [],
      1040,
      undefined,
      400
    )
  }

  const profiles = await Profile.findOne({ accountId: user.accountId })
  if (!profiles) {
    return error.createError(
      c,
      'errors.com.epicgames.modules.profiles.not_found',
      `Profiles not found for accountId ${user.accountId}`,
      [user.accountId],
      12813,
      undefined,
      404
    )
  }

  if (!profiles || !await profileMgr.validateProfile(profileId!, profiles)) {
    return error.createError(
      c,
      'errors.com.epicgames.modules.profiles.operation_forbidden',
      `Unable to find template configuration for profile ${profileId}`,
      [profileId],
      12813,
      undefined,
      403
    )
  }

  if (profileId !== 'common_core') {
    return error.createError(
      c,
      'errors.com.epicgames.modules.profiles.invalid_command',
      `GiftCatalogEntry is not valid on ${profileId} profile`,
      ['GiftCatalogEntry', profileId],
      12801,
      undefined,
      400
    )
  }

  const profile = (profiles.profiles as any)[profileId]
  const memory = functions.GetVersionInfo(c.req)
  
  const Notifications: any[] = []
  let ApplyProfileChanges: any[] = []
  const BaseRevision = profile.rvn
  const ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn
  const QueryRevision = Number(query.rvn) || -1

  const validGiftBoxes = [
    'GiftBox:gb_default',
    'GiftBox:gb_giftwrap1',
    'GiftBox:gb_giftwrap2',
    'GiftBox:gb_giftwrap3'
  ]

  const missingFields = getMissingFields(['offerId', 'receiverAccountIds', 'giftWrapTemplateId'], body)

  if (missingFields.fields.length > 0) {
    return error.createError(
      c,
      'errors.com.epicgames.validation.validation_failed',
      `Validation Failed. [${missingFields.fields.join(', ')}] field(s) is missing.`,
      [`[${missingFields.fields.join(', ')}]`],
      1040,
      undefined,
      400
    )
  }

  if (typeof body.offerId !== 'string') {
    return error.createError(
      c,
      'errors.com.epicgames.validation.validation_failed',
      'Validation Failed itemToSlot is not a string.',
      ['itemToSlot'],
      1040,
      undefined,
      400
    )
  }

  if (!Array.isArray(body.receiverAccountIds)) {
    return error.createError(
      c,
      'errors.com.epicgames.validation.validation_failed',
      'Validation Failed receiverAccountIds is not an array.',
      ['receiverAccountIds'],
      1040,
      undefined,
      400
    )
  }

  if (typeof body.giftWrapTemplateId !== 'string') {
    return error.createError(
      c,
      'errors.com.epicgames.validation.validation_failed',
      'Validation Failed giftWrapTemplateId is not a string.',
      ['giftWrapTemplateId'],
      1040,
      undefined,
      400
    )
  }

  if (typeof body.personalMessage !== 'string') {
    return error.createError(
      c,
      'errors.com.epicgames.validation.validation_failed',
      'Validation Failed personalMessage is not a string.',
      ['personalMessage'],
      1040,
      undefined,
      400
    )
  }

  if (body.personalMessage.length > 100) {
    return error.createError(
      c,
      'errors.com.epicgames.string.length_check',
      'The personalMessage you provided is longer than 100 characters, please make sure your personal message is less than 100 characters long and try again.',
      [],
      16027,
      undefined,
      400
    )
  }

  if (!validGiftBoxes.includes(body.giftWrapTemplateId)) {
    return error.createError(
      c,
      'errors.com.epicgames.giftbox.invalid',
      'The giftbox you provided is invalid, please provide a valid giftbox and try again.',
      [],
      16027,
      undefined,
      400
    )
  }

  if (body.receiverAccountIds.length < 1 || body.receiverAccountIds.length > 5) {
    return error.createError(
      c,
      'errors.com.epicgames.item.quantity.range_check',
      'You need to atleast gift to 1 person and can not gift to more than 5 people.',
      [],
      16027,
      undefined,
      400
    )
  }

  if (checkIfDuplicateExists(body.receiverAccountIds)) {
    return error.createError(
      c,
      'errors.com.epicgames.array.duplicate_found',
      'There are duplicate accountIds in receiverAccountIds, please remove the duplicates and try again.',
      [],
      16027,
      undefined,
      400
    )
  }

  const sender = await Friends.findOne({ accountId: user.accountId }).lean()

  for (const receiverId of body.receiverAccountIds) {
    if (typeof receiverId !== 'string') {
      return error.createError(
        c,
        'errors.com.epicgames.array.invalid_string',
        'There is a non-string object inside receiverAccountIds, please provide a valid value and try again.',
        [],
        16027,
        undefined,
        400
      )
    }

    if (!sender?.list.accepted.find(i => i.accountId === receiverId) && receiverId !== user.accountId) {
      return error.createError(
        c,
        'errors.com.epicgames.friends.no_relationship',
        `User ${user.accountId} is not friends with ${receiverId}`,
        [user.accountId, receiverId],
        28004,
        undefined,
        403
      )
    }
  }

  if (!profile.items) profile.items = {}

  const findOfferId = await itemShop.getOfferID(body.offerId)
  if (!findOfferId) {
    return error.createError(
      c,
      'errors.com.epicgames.fortnite.id_invalid',
      `Offer ID (id: '${body.offerId}') not found`,
      [body.offerId],
      16027,
      undefined,
      400
    )
  }

  if (/^BR(Daily|Weekly)Storefront$/.test(findOfferId.name)) {
    if (findOfferId.offerId.prices[0]!.currencyType.toLowerCase() === 'mtxcurrency') {
      let paid = false
      const price = (findOfferId.offerId.prices[0]!.finalPrice) * body.receiverAccountIds.length

      for (const key in profile.items) {
        if (!profile.items[key].templateId.toLowerCase().startsWith('currency:mtx')) continue

        const currencyPlatform = profile.items[key].attributes.platform
        if (
          currencyPlatform.toLowerCase() !== profile.stats.attributes.current_mtx_platform.toLowerCase() &&
          currencyPlatform.toLowerCase() !== 'shared'
        ) continue

        if (profile.items[key].quantity < price) {
          return error.createError(
            c,
            'errors.com.epicgames.currency.mtx.insufficient',
            `You can not afford this item (${price}), you only have ${profile.items[key].quantity}.`,
            [`${price}`, `${profile.items[key].quantity}`],
            1040,
            undefined,
            400
          )
        }

        profile.items[key].quantity -= price
        ApplyProfileChanges.push({
          changeType: 'itemQuantityChanged',
          itemId: key,
          quantity: profile.items[key].quantity
        })
        paid = true
        break
      }

      if (!paid && price > 0) {
        return error.createError(
          c,
          'errors.com.epicgames.currency.mtx.insufficient',
          'You can not afford this item.',
          [],
          1040,
          undefined,
          400
        )
      }
    }

    for (const receiverId of body.receiverAccountIds) {
      const receiverProfiles = await Profile.findOne({ accountId: receiverId })
      const athena = (receiverProfiles?.profiles as any)['athena']
      const common_core = (receiverProfiles?.profiles as any)['common_core']

      if (!athena?.items) athena.items = {}

      if (!common_core?.stats.attributes.allowed_to_receive_gifts) {
        return error.createError(
          c,
          'errors.com.epicgames.user.gift_disabled',
          `User ${receiverId} has disabled receiving gifts.`,
          [receiverId],
          28004,
          undefined,
          403
        )
      }

      for (const itemGrant of findOfferId.offerId.itemGrants) {
        for (const itemId in athena.items) {
          if (itemGrant.templateId.toLowerCase() === athena.items[itemId].templateId.toLowerCase()) {
            return error.createError(
              c,
              'errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed',
              `User ${receiverId} already owns this item.`,
              [receiverId],
              28004,
              undefined,
              403
            )
          }
        }
      }
    }

    for (const receiverId of body.receiverAccountIds) {
      const receiverProfiles = await Profile.findOne({ accountId: receiverId })
      const athena = (receiverProfiles?.profiles as any)['athena']
      const common_core = receiverId === user.accountId ? profile : (receiverProfiles?.profiles as any)['common_core']

      const giftBoxItemID = functions.MakeID()
      const giftBoxItem = {
        templateId: body.giftWrapTemplateId,
        attributes: {
          fromAccountId: user.accountId,
          lootList: [] as any[],
          params: {
            userMessage: body.personalMessage
          },
          level: 1,
          giftedOn: new Date().toISOString()
        },
        quantity: 1
      }

      if (!athena?.items) athena.items = {}
      if (!common_core?.items) common_core.items = {}

      for (const value of findOfferId.offerId.itemGrants) {
        const ID = functions.MakeID()

        const entry = variantsData.find(v => v.id.toLowerCase() === value.templateId.toLowerCase());
        const variants = entry?.variants || [];

        const Item = {
          templateId: value.templateId,
          attributes: {
            item_seen: false,
            variants: variants
          },
          quantity: 1
        }

        athena.items[ID] = Item

        giftBoxItem.attributes.lootList.push({
          itemType: Item.templateId,
          itemGuid: ID,
          itemProfile: 'athena',
          quantity: 1
        })
      }

      common_core.items[giftBoxItemID] = giftBoxItem

      if (receiverId === user.accountId) {
        ApplyProfileChanges.push({
          changeType: 'itemAdded',
          itemId: giftBoxItemID,
          item: common_core.items[giftBoxItemID]
        })
      }

      athena.rvn += 1
      athena.commandRevision += 1
      athena.updated = new Date().toISOString()

      common_core.rvn += 1
      common_core.commandRevision += 1
      common_core.updated = new Date().toISOString()

      await receiverProfiles?.updateOne({
        $set: {
          'profiles.athena': athena,
          'profiles.common_core': common_core
        }
      })

      g.giftReceived[receiverId] = true

      xmpp.sendMessageToAccountId(
        {
          type: 'com.epicgames.gift.received',
          payload: {},
          timestamp: new Date().toISOString()
        },
        receiverId
      )
    }
  }

  if (ApplyProfileChanges.length > 0 && !body.receiverAccountIds.includes(user.accountId)) {
    profile.rvn += 1
    profile.commandRevision += 1
    profile.updated = new Date().toISOString()

    await profiles.updateOne({
      $set: {
        [`profiles.${profileId}`]: profile
      }
    })
  }

  if (QueryRevision !== ProfileRevisionCheck) {
    ApplyProfileChanges = [
      {
        changeType: 'fullProfileUpdate',
        profile
      }
    ]
  }

  return c.json({
    profileRevision: profile.rvn || 0,
    profileId,
    profileChangesBaseRevision: BaseRevision,
    profileChanges: ApplyProfileChanges,
    notifications: Notifications,
    profileCommandRevision: profile.commandRevision || 0,
    serverTime: new Date().toISOString(),
    responseVersion: 1
  })
})

router.post("/fortnite/api/game/v2/profile/*/client/:operation", verifyToken, async (c) => {
  const user = c.get("user");
  const accountId = user.accountId;
  const query = c.req.query();
  const operation = c.req.param("operation");
  const profileId = query.profileId as string;

  const profiles = await Profile.findOne({ accountId });

  if (!profiles || !await profileMgr.validateProfile(profileId, profiles)) {
    return error.createError(
      c,
      "errors.com.epicgames.modules.profiles.operation_forbidden",
      `Unable to find template configuration for profile ${profileId}`,
      [profileId],
      12813,
      undefined,
      403
    );
  }

  let profile = (profiles?.profiles as any)[profileId];

  if (profile.rvn === profile.commandRevision) {
    profile.rvn += 1;

    if (profileId === "athena") {
      if (!profile.stats.attributes.last_applied_loadout) {
        profile.stats.attributes.last_applied_loadout = profile.stats.attributes.loadouts[0];
      }
    }

    await profiles?.updateOne({ $set: { [`profiles.${profileId}`]: profile } });
  }

  const memory = functions.GetVersionInfo(c.req);

  if (profileId === "athena") profile.stats.attributes.season_num = memory.season;

  let MultiUpdate: any[] = [];

  if (profileId === "common_core" && g.giftReceived?.[accountId]) {
    g.giftReceived[accountId] = false;

    let athena = (profiles?.profiles as any)["athena"];

    MultiUpdate = [{
      profileRevision: athena.rvn || 0,
      profileId: "athena",
      profileChangesBaseRevision: athena.rvn || 0,
      profileChanges: [{
        changeType: "fullProfileUpdate",
        profile: athena
      }],
      profileCommandRevision: athena.commandRevision || 0,
    }];
  }

  let ApplyProfileChanges: any[] = [];
  let BaseRevision = profile.rvn;
  let ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn;
  let QueryRevision = Number(query.rvn) || -1;

  switch (operation) {
    case "QueryProfile":
    case "ClientQuestLogin":
    case "RefreshExpeditions":
    case "GetMcpTimeForLogin":
    case "IncrementNamedCounterStat":
    case "SetHardcoreModifier":
    case "SetMtxPlatform":
    case "BulkEquipBattleRoyaleCustomization":
      break;

    default:
      return error.createError(
        c,
        "errors.com.epicgames.fortnite.operation_not_found",
        `Operation ${operation} not valid`,
        [operation],
        16035,
        undefined,
        404
      );
  }

  if (QueryRevision !== ProfileRevisionCheck) {
    ApplyProfileChanges = [{
      changeType: "fullProfileUpdate",
      profile
    }];
  }

  return c.json({
    profileRevision: profile.rvn || 0,
    profileId,
    profileChangesBaseRevision: BaseRevision,
    profileChanges: ApplyProfileChanges,
    profileCommandRevision: profile.commandRevision || 0,
    serverTime: new Date().toISOString(),
    multiUpdate: MultiUpdate,
    responseVersion: 1
  });
});

router.post('/fortnite/api/game/v2/profile/:accountId/dedicated_server/:operation', async (c) => {
  const accountId = c.req.param('accountId')
  const operation = c.req.param('operation')

  const profiles = await Profile.findOne({ accountId }).lean()
  if (!profiles) {
    return c.json({}, 404)
  }

  const profileId = c.req.query('profileId') || ''
  if (!profiles || !await profileMgr.validateProfile(profileId, profiles)) {
    return error.createError(c,
      'errors.com.epicgames.modules.profiles.operation_forbidden',
      `Unable to find template configuration for profile ${profileId}`,
      [profileId],
      12813,
      undefined,
      403
    )
  }

  const profile = (profiles.profiles as any)[profileId]
  const BaseRevision = profile.rvn
  const QueryRevision = parseInt(c.req.query('rvn') || '-1')

  let ApplyProfileChanges: any[] = []
  if (QueryRevision !== BaseRevision) {
    ApplyProfileChanges = [{
      changeType: 'fullProfileUpdate',
      profile
    }]
  }

  return c.json({
    profileRevision: profile.rvn || 0,
    profileId,
    profileChangesBaseRevision: BaseRevision,
    profileChanges: ApplyProfileChanges,
    profileCommandRevision: profile.commandRevision || 0,
    serverTime: new Date().toISOString(),
    responseVersion: 1
  })
})

function getMissingFields<T extends Record<string, any>>(fields: string[], body: T) {
  const missingFields = { fields: [] as string[] }

  for (const field of fields) {
    if (!body[field]) {
      missingFields.fields.push(field)
    }
  }

  return missingFields
}

function checkIfDuplicateExists(arr: any[]) {
  return new Set(arr).size !== arr.length
}

export default router;
