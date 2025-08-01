import { Hono } from "hono";
import type { Env } from "../types/env";
import { verifyToken } from "../tokens/tokenFunctions";
import * as error from "../utils/error.js";
import Friends from "../models/friends.ts";
import Profile from "../models/profiles.ts";
import * as itemshop from "../utils/itemshop.ts";

const router = new Hono<Env>();

router.get('/fortnite/api/storefront/v2/catalog', verifyToken, async (c) => {
    const shopResponse = await itemshop.getItemShop()
    if (c.req.header("user-agent") == undefined) return;
    if (c.req.header("user-agent")?.includes("2870186")) {
        return c.body(null, 404)
    }

    return c.json(shopResponse, 200)
})

router.get('/fortnite/api/storefront/v2/keychain', async (c) => {
    let keychain = await import ('../../static/ItemShop/keychain.json')
    return c.json(keychain.default)
})

router.get('/catalog/api/shared/bulk/offers', (c) => {
    return c.json({}, 200)
})

router.get('/fortnite/api/storefront/v2/gift/check_eligibility/recipient/:recipientId/offer/:offerId', verifyToken, async (c) => {
    const recipientId = c.req.param("recipientId");
    const offerIdParam = c.req.param("offerId");

    const findOfferId = await itemshop.getOfferID(offerIdParam);
    if (!findOfferId) {
      return error.createError(c,
        "errors.com.epicgames.fortnite.id_invalid",
        `Offer ID (id: "${offerIdParam}") not found`,
        [offerIdParam],
        16027,
        undefined,
        400
      );
    }

    const user = c.get("user");
    if (!user) {
      return error.createError(c,
        "errors.com.epicgames.unauthorized",
        "User not authenticated",
        [],
        401,
        undefined,
        401
      );
    }

    const sender = await Friends.findOne({ accountId: user.accountId }).lean();
    if (
      !sender?.list?.accepted?.find((i: any) => i.accountId === recipientId) &&
      recipientId !== user.accountId
    ) {
      return error.createError(c,
        "errors.com.epicgames.friends.no_relationship",
        `User ${user.accountId} is not friends with ${recipientId}`,
        [user.accountId, recipientId],
        28004,
        undefined,
        403
      );
    }

    const profiles = await Profile.findOne({ accountId: recipientId });
    if (!profiles) {
      return error.createError(c,
        "errors.com.epicgames.account.account_not_found",
        `Profile not found for ${recipientId}`,
        [recipientId],
        404,
        undefined,
        404
      );
    }

    const athena = (profiles.profiles as any).athena;

    for (const itemGrant of findOfferId.offerId.itemGrants) {
      for (const itemId in athena.items) {
        if (
          itemGrant.templateId.toLowerCase() ===
          athena.items[itemId].templateId.toLowerCase()
        ) {
          return error.createError(c,
            "errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed",
            `Could not purchase catalog offer ${findOfferId.offerId.devName}, item ${itemGrant.templateId}`,
            [findOfferId.offerId.devName, itemGrant.templateId],
            28004,
            undefined,
            403
          );
        }
      }
    }

    return c.json({
      price: findOfferId.offerId.prices[0],
      items: findOfferId.offerId.itemGrants,
    });
})

export default router