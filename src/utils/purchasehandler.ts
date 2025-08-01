import * as functions from './functions'
import variantsData from '../../static/ItemShop/variants.json'

export function handleBattlePassPurchase(
  athena: any,
  profile: any,
  profiles: any,
  BattlePass: any,
  offerId: string,
  OnlySeasonNumber: number,
  ApplyProfileChanges: any[],
  MultiUpdate: any[]
) {
  const lootList: any[] = []
  let EndingTier = athena.stats.attributes.book_level
  athena.stats.attributes.book_purchased = true

  const tokenKey = `Token:Athena_S${OnlySeasonNumber}_NoBattleBundleOption_Token`
  const tokenData = {
    templateId: `Token:athena_s${OnlySeasonNumber}_nobattlebundleoption_token`,
    attributes: {
      max_level_bonus: 0,
      level: 1,
      item_seen: true,
      xp: 0,
      favorite: false
    },
    quantity: 1
  }

  profiles.profiles["common_core"].items[tokenKey] = tokenData

  ApplyProfileChanges.push({
    changeType: "itemAdded",
    itemId: tokenKey,
    item: tokenData
  })

  if (BattlePass.battleBundleOfferId === offerId) {
    athena.stats.attributes.book_level += 25
    if (athena.stats.attributes.book_level > 100) {
      athena.stats.attributes.book_level = 100
    }
    EndingTier = athena.stats.attributes.book_level
  }

  let ItemExists = false

  for (let i = 0; i < EndingTier; i++) {
    const FreeTier = BattlePass.freeRewards[i] || {}
    const PaidTier = BattlePass.paidRewards[i] || {}

    const processRewardTier = (tier: Record<string, number>) => {
      for (const item in tier) {
        const lowerItem = item.toLowerCase()
        const quantity = tier[item]

        if (lowerItem === "token:athenaseasonxpboost") {
          athena.stats.attributes.season_match_boost += quantity
          MultiUpdate[0].profileChanges.push({
            changeType: "statModified",
            name: "season_match_boost",
            value: athena.stats.attributes.season_match_boost
          })
        }
        if (lowerItem === "token:athenaseasonfriendxpboost") {
          athena.stats.attributes.season_friend_match_boost += quantity
          MultiUpdate[0].profileChanges.push({
            changeType: "statModified",
            name: "season_friend_match_boost",
            value: athena.stats.attributes.season_friend_match_boost
          })
        }

        if (lowerItem.startsWith("currency:mtx")) {
          for (const key in profile.items) {
            const pItem = profile.items[key]
            if (pItem.templateId.toLowerCase().startsWith("currency:mtx")) {
              const platform = pItem.attributes.platform.toLowerCase()
              const currentPlatform = profile.stats.attributes.current_mtx_platform.toLowerCase()
              if (platform === currentPlatform || platform === "shared") {
                pItem.quantity = (pItem.quantity || pItem.attributes.quantity || 0) + quantity
                break
              }
            }
          }
        }

        if (lowerItem.startsWith("homebasebanner")) {
          for (const key in profile.items) {
            if (profile.items[key].templateId.toLowerCase() === lowerItem) {
              profile.items[key].attributes.item_seen = false
              ItemExists = true
              ApplyProfileChanges.push({
                changeType: "itemAttrChanged",
                itemId: key,
                attributeName: "item_seen",
                attributeValue: profile.items[key].attributes.item_seen
              })
            }
          }
          if (!ItemExists) {
            const ItemID = functions.MakeID()
            const Item = { templateId: item, attributes: { item_seen: false }, quantity: 1 }
            profile.items[ItemID] = Item
            ApplyProfileChanges.push({
              changeType: "itemAdded",
              itemId: ItemID,
              item: Item
            })
          }
          ItemExists = false
        }

        if (lowerItem.startsWith("athena")) {
          for (const key in athena.items) {
            if (athena.items[key].templateId.toLowerCase() === lowerItem) {
              athena.items[key].attributes.item_seen = false
              ItemExists = true
              MultiUpdate[0].profileChanges.push({
                changeType: "itemAttrChanged",
                itemId: key,
                attributeName: "item_seen",
                attributeValue: athena.items[key].attributes.item_seen
              })
            }
          }
          if (!ItemExists) {
            const ItemID = functions.MakeID()
            const Item = {
              templateId: item,
              attributes: { max_level_bonus: 0, level: 1, item_seen: false, xp: 0, variants: [], favorite: false },
              quantity: quantity
            }
            athena.items[ItemID] = Item
            MultiUpdate[0].profileChanges.push({
              changeType: "itemAdded",
              itemId: ItemID,
              item: Item
            })
          }
          ItemExists = false
        }

        lootList.push({
          itemType: item,
          itemGuid: item,
          quantity: quantity
        })
      }
    }

    processRewardTier(FreeTier)
    processRewardTier(PaidTier)
  }

  const GiftBoxID = functions.MakeID()
  const GiftBox = {
    templateId: 8 <= 4 ? "GiftBox:gb_battlepass" : "GiftBox:gb_battlepasspurchased",
    attributes: {
      max_level_bonus: 0,
      fromAccountId: "",
      lootList: lootList
    }
  }

  if (8 > 2) {
    profile.items[GiftBoxID] = GiftBox
    ApplyProfileChanges.push({
      changeType: "itemAdded",
      itemId: GiftBoxID,
      item: GiftBox
    })
  }

  MultiUpdate[0].profileChanges.push({
    changeType: "statModified",
    name: "book_purchased",
    value: athena.stats.attributes.book_purchased
  })
  MultiUpdate[0].profileChanges.push({
    changeType: "statModified",
    name: "book_level",
    value: athena.stats.attributes.book_level
  })
}

export function handleBattlePassLevelUp(
  athena: any,
  profile: any,
  BattlePass: any,
  reqBody: any,
  ApplyProfileChanges: any[],
  MultiUpdate: any[]
) {
  const lootList: any[] = []
  const StartingTier = athena.stats.attributes.book_level
  const purchaseQuantity = reqBody.purchaseQuantity ?? 1
  athena.stats.attributes.book_level += purchaseQuantity
  const EndingTier = athena.stats.attributes.book_level

  let ItemExists = false

  for (let i = StartingTier; i < EndingTier; i++) {
    const FreeTier = BattlePass.freeRewards[i] || {}
    const PaidTier = BattlePass.paidRewards[i] || {}

    const processRewardTier = (tier: any) => {
      for (const item in tier) {
        const lowerItem = item.toLowerCase()
        const quantity = tier[item]

        if (lowerItem === "token:athenaseasonxpboost") {
          athena.stats.attributes.season_match_boost += quantity
          MultiUpdate[0].profileChanges.push({
            changeType: "statModified",
            name: "season_match_boost",
            value: athena.stats.attributes.season_match_boost,
          })
        }

        if (lowerItem === "token:athenaseasonfriendxpboost") {
          athena.stats.attributes.season_friend_match_boost += quantity
          MultiUpdate[0].profileChanges.push({
            changeType: "statModified",
            name: "season_friend_match_boost",
            value: athena.stats.attributes.season_friend_match_boost,
          })
        }

        if (lowerItem.startsWith("currency:mtx")) {
          for (const key in profile.items) {
            const pItem = profile.items[key]
            if (pItem.templateId.toLowerCase().startsWith("currency:mtx")) {
              const platform = pItem.attributes.platform.toLowerCase()
              const currentPlatform = profile.stats.attributes.current_mtx_platform.toLowerCase()
              if (platform === currentPlatform || platform === "shared") {
                pItem.quantity = (pItem.quantity || 0) + quantity
                break
              }
            }
          }
        }

        if (lowerItem.startsWith("homebasebanner")) {
          for (const key in profile.items) {
            if (profile.items[key].templateId.toLowerCase() === lowerItem) {
              profile.items[key].attributes.item_seen = false
              ItemExists = true
              ApplyProfileChanges.push({
                changeType: "itemAttrChanged",
                itemId: key,
                attributeName: "item_seen",
                attributeValue: profile.items[key].attributes.item_seen,
              })
            }
          }
          if (!ItemExists) {
            const ItemID = functions.MakeID()
            const Item = { templateId: item, attributes: { item_seen: false }, quantity: 1 }
            profile.items[ItemID] = Item
            ApplyProfileChanges.push({
              changeType: "itemAdded",
              itemId: ItemID,
              item: Item,
            })
          }
          ItemExists = false
        }

        if (lowerItem.startsWith("athena")) {
          for (const key in athena.items) {
            if (athena.items[key].templateId.toLowerCase() === lowerItem) {
              athena.items[key].attributes.item_seen = false
              ItemExists = true
              MultiUpdate[0].profileChanges.push({
                changeType: "itemAttrChanged",
                itemId: key,
                attributeName: "item_seen",
                attributeValue: athena.items[key].attributes.item_seen,
              })
            }
          }
          if (!ItemExists) {
            const ItemID = functions.MakeID()
            const Item = {
              templateId: item,
              attributes: { max_level_bonus: 0, level: 1, item_seen: false, xp: 0, variants: [], favorite: false },
              quantity: quantity,
            }
            athena.items[ItemID] = Item
            MultiUpdate[0].profileChanges.push({
              changeType: "itemAdded",
              itemId: ItemID,
              item: Item,
            })
          }
          ItemExists = false
        }

        lootList.push({
          itemType: item,
          itemGuid: item,
          quantity: quantity,
        })
      }
    }

    processRewardTier(FreeTier)
    processRewardTier(PaidTier)
  }

  const GiftBoxID = functions.MakeID()
  const GiftBox = {
    templateId: "GiftBox:gb_battlepass",
    attributes: {
      max_level_bonus: 0,
      fromAccountId: "",
      lootList: lootList,
    },
  }

  if (8 > 2) {
    profile.items[GiftBoxID] = GiftBox
    ApplyProfileChanges.push({
      changeType: "itemAdded",
      itemId: GiftBoxID,
      item: GiftBox,
    })
  }

  MultiUpdate[0].profileChanges.push({
    changeType: "statModified",
    name: "book_level",
    value: athena.stats.attributes.book_level,
  })
}

export function handleCatalogPurchase(
  athena: any,
  profile: any,
  findOfferId: any,
  ApplyProfileChanges: any[],
  MultiUpdate: any[],
  Notifications: any[],
  error: any,
  res: any
) {
  Notifications.push({
    type: "CatalogPurchase",
    primary: true,
    lootResult: { items: [] }
  })

  for (const value of findOfferId.offerId.itemGrants) {
    const ID = functions.MakeID()

    for (const itemId in athena.items) {
      if (value.templateId.toLowerCase() === athena.items[itemId].templateId.toLowerCase()) {
        return error.createError(
          "errors.com.epicgames.offer.already_owned",
          "You have already bought this item before.",
          undefined, 1040, undefined, 400, res
        )
      }
    }

    const entry = variantsData.find(v => v.id.toLowerCase() === value.templateId.toLowerCase());
    const variants = entry?.variants || [];

    const Item = {
      templateId: value.templateId,
      attributes: { item_seen: false, variants: variants },
      quantity: 1
    }

    athena.items[ID] = Item

    MultiUpdate[0].profileChanges.push({
      changeType: "itemAdded",
      itemId: ID,
      item: athena.items[ID]
    })

    Notifications[0].lootResult.items.push({
      itemType: Item.templateId,
      itemGuid: ID,
      itemProfile: "athena",
      quantity: 1
    })
  }

  if (findOfferId.offerId.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
    let paid = false
    const finalPrice = findOfferId.offerId.prices[0].finalPrice

    for (const key in profile.items) {
      const pItem = profile.items[key]
      if (!pItem.templateId.toLowerCase().startsWith("currency:mtx")) continue

      const currencyPlatform = pItem.attributes.platform
      const currentPlatform = profile.stats.attributes.current_mtx_platform

      if (
        currencyPlatform.toLowerCase() !== currentPlatform.toLowerCase() &&
        currencyPlatform.toLowerCase() !== "shared"
      ) continue

      if (pItem.quantity < finalPrice) {
        return error.createError(
          "errors.com.epicgames.currency.mtx.insufficient",
          `You cannot afford this item (${finalPrice}), you only have ${pItem.quantity}.`,
          [`${finalPrice}`, `${pItem.quantity}`], 1040, undefined, 400, res
        )
      }

      pItem.quantity -= finalPrice

      ApplyProfileChanges.push({
        changeType: "itemQuantityChanged",
        itemId: key,
        quantity: pItem.quantity
      })

      paid = true
      break
    }

    if (!paid && finalPrice > 0) {
      return error.createError(
        "errors.com.epicgames.currency.mtx.insufficient",
        `You cannot afford this item (${finalPrice}).`,
        [`${finalPrice}`], 1040, undefined, 400, res
      )
    }

    if (findOfferId.offerId.itemGrants.length !== 0) {
      if (!profile.stats.attributes.mtx_purchase_history) {
        profile.stats.attributes.mtx_purchase_history = { purchases: [] }
      }

      const purchaseId = functions.MakeID()
      const purchaseEntry = {
        purchaseId: purchaseId,
        offerId: `v2:/${purchaseId}`,
        purchaseDate: new Date().toISOString(),
        freeRefundEligible: false,
        fulfillments: [],
        lootResult: Notifications[0].lootResult.items,
        totalMtxPaid: finalPrice,
        metadata: {},
        gameContext: ""
      }

      profile.stats.attributes.mtx_purchase_history.purchases.push(purchaseEntry)

      ApplyProfileChanges.push({
        changeType: "statModified",
        name: "mtx_purchase_history",
        value: profile.stats.attributes.mtx_purchase_history
      })
    }
  }
}
