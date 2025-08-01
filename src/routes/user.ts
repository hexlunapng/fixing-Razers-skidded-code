import { Hono } from "hono";
import * as error from '../utils/error'
import { verifyToken, verifyClient } from "../tokens/tokenFunctions.ts";
import User from "../models/user.ts";
import type { Env } from "../types/env";

const router = new Hono<Env>();

router.get("/account/api/public/account", async (c) => {
  const accountId = c.req.query("accountId");
  const response: any[] = [];

  if (typeof accountId === "string") {
    const user = await User.findOne({ accountId, banned: false }).lean();
    if (user) {
      response.push({
        id: user.accountId,
        displayName: user.username,
        externalAuths: {},
      });
    }
  }

  if (Array.isArray(accountId)) {
    const users = await User.find({ accountId: { $in: accountId }, banned: false }).lean();
    if (users) {
      for (const user of users) {
        if (response.length >= 100) break;
        response.push({
          id: user.accountId,
          displayName: user.username,
          externalAuths: {},
        });
      }
    }
  }

  return c.json(response);
});

router.get("/account/api/public/account/displayName/:displayName", async (c) => {
  const displayName = c.req.param("displayName");
  const user = await User.findOne({
    username: displayName,
    banned: false,
  }).lean();

  if (!user || user.isServer) {
    return error.createError(c,
      "errors.com.epicgames.account.account_not_found",
      `Sorry, we couldn't find an account for ${displayName}`,
      [displayName],
      18007,
      undefined,
      404
    );
  }

  return c.json({
    id: user.accountId,
    displayName: user.username,
    externalAuths: {},
  });
});

router.get("/persona/api/public/account/lookup", async (c) => {
  const q = c.req.query("q");
  if (typeof q !== "string" || !q) {
    return error.createError(c,
      "errors.com.epicgames.bad_request",
      "Required String parameter 'q' is invalid or not present",
      [],
      1001,
      undefined,
      400
    );
  }

  const user = await User.findOne({ username: q, banned: false }).lean();
  if (!user) {
    return error.createError(c,
      "errors.com.epicgames.account.account_not_found",
      `Sorry, we couldn't find an account for ${q}`,
      [q],
      18007,
      undefined,
      404
    );
  }

  return c.json({
    id: user.accountId,
    displayName: user.username,
    externalAuths: {},
  });
});

router.get("/api/v1/search/:accountId", async (c) => {
  const prefix = c.req.query("prefix");
  if (typeof prefix !== "string" || !prefix) {
    return error.createError(c,
      "errors.com.epicgames.bad_request",
      "Required String parameter 'prefix' is invalid or not present",
      [],
      1001,
      undefined,
      400
    );
  }

  const users = await User.find({
    username: new RegExp(`^${prefix}`),
    banned: false,
  }).lean();

  const response: any[] = [];
  for (const user of users) {
    if (response.length >= 100) break;
    response.push({
      accountId: user.accountId,
      matches: [{ value: user.username, platform: "epic" }],
      matchType: prefix === user.username ? "exact" : "prefix",
      epicMutuals: 0,
      sortPosition: response.length,
    });
  }

  return c.json(response);
});

router.get("/account/api/public/account/:accountId", verifyToken, (c) => {
  const user = c.get("user");

  return c.json({
    id: user?.accountId,
    displayName: user?.username,
    name: "Aegis",
    email: `[hidden]@${user?.email.split("@")[1]}`,
    failedLoginAttempts: 0,
    lastLogin: new Date().toISOString(),
    numberOfDisplayNameChanges: 0,
    ageGroup: "UNKNOWN",
    headless: false,
    country: "MA",
    lastName: "Backend",
    preferredLanguage: "en",
    canUpdateDisplayName: false,
    tfaEnabled: false,
    emailVerified: true,
    minorVerified: false,
    minorExpected: false,
    minorStatus: "NOT_MINOR",
    cabinedMode: false,
    hasHashedEmail: false,
  });
});

router.get("/sdk/v1/*", async (c) => {
  const sdk = await import("../../static/responses/sdkv1.json");
  return c.json(sdk.default || sdk);
});

router.get("/epic/id/v2/sdk/accounts", async (c) => {
  const accountId = c.req.query("accountId");
  const user = await User.findOne({ accountId, banned: false }).lean();

  if (!user) {
    return error.createError(c,
      "errors.com.epicgames.account.account_not_found",
      `Sorry, we couldn't find an account for ${accountId}`,
      [accountId],
      18007,
      undefined,
      404
    );
  }

  return c.json([
    {
      accountId: user.accountId,
      displayName: user.username,
      preferredLanguage: "en",
      cabinedMode: false,
      empty: false,
    },
  ]);
});

router.all("/fortnite/api/game/v2/profileToken/verify/:accountId", async (c) => {
  if (c.req.method !== "POST") {
    const err = {
      header: "Allow: POST",
      error: "Method Not Allowed"
    };

    c.header(err.header);
    return c.text(err.error, 405);
  }

  return c.body(null, 204);
});


router.all("/v1/epic-settings/public/users/*/values", (c) => c.json({}));

router.get("/account/api/public/account/*/externalAuths", (c) => c.json([]));

router.get('/fortnite/api/receipts/v1/account/*/receipts', (c) => c.json([]))

router.get("/account/api/epicdomains/ssodomains", (c) =>
  c.json([
    "unrealengine.com",
    "unrealtournament.com",
    "fortnite.com",
    "epicgames.com",
  ])
);

router.post("/fortnite/api/game/v2/tryPlayOnPlatform/account/*", (c) => {
  c.header("Content-Type", "text/plain");
  return c.text("true");
});

router.get('/fortnite/api/game/v2/br-inventory/account/*', (c) => {
    return c.json({
        stash: {
            globalcash: 0
        }
    })
})

router.post('/api/v1/user/setting', (c) => c.json([]))

export default router;
