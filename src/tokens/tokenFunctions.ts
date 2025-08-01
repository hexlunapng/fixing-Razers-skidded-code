import * as functions from "../utils/functions.ts";
import jwt from "jsonwebtoken";
import fs from "fs";
import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import type { Env } from '../types/env'
import User, { type IUser } from "../models/user.ts";
import * as error from "../utils/error";

interface TokenPayload {
  p?: string;
  clsvc?: string;
  t?: string;
  mver?: boolean;
  clid?: string;
  ic?: boolean;
  am?: string;
  jti?: string;
  creation_date: Date;
  hours_expire: number;
  app?: string;
  sub?: string;
  dvid?: string;
  dn?: string;
  iai?: string;
  sec?: number;
}

declare global {
  namespace NodeJS {
    interface Global {
      JWT_SECRET: string;
      clientTokens: Array<{ ip: string; token: string }>;
      accessTokens: Array<{ accountId: string; token: string }>;
      refreshTokens: Array<{ accountId: string; token: string }>;
    }
  }
}

const g = global as unknown as NodeJS.Global;

const tokens = JSON.parse(fs.readFileSync("./src/tokens/tokens.json", "utf-8"));

for (const tokenType in tokens) {
    tokens[tokenType] = tokens[tokenType].filter((entry: { token: string }) => {
        const decoded = jwt.decode(entry.token.replace("eg1~", "")) as TokenPayload | null;
        if (!decoded) return false;

        const creationDate = new Date(decoded.creation_date);
        const expires = new Date(creationDate.getTime() + decoded.hours_expire * 60 * 60 * 1000);

        return expires.getTime() > Date.now();
    });
}

fs.writeFileSync("./src/tokens/tokens.json", JSON.stringify(tokens, null, 2));

g.JWT_SECRET = process.env.JWT_SECRET || "";
g.accessTokens = tokens.accessTokens || [];
g.refreshTokens = tokens.refreshTokens || [];
g.clientTokens = tokens.clientTokens || []

export function createClient(clientId: string, grant_type: string, ip: string, expiresIn: number): string {
  const clientToken = jwt.sign(
    {
      p: Buffer.from(functions.MakeID()).toString("base64"),
      clsvc: "fortnite",
      t: "s",
      mver: false,
      clid: clientId,
      ic: true,
      am: grant_type,
      jti: functions.MakeID(),
      creation_date: new Date(),
      hours_expire: expiresIn,
    },
    g.JWT_SECRET,
    { expiresIn: `${expiresIn}h` }
  );

  g.clientTokens.push({ ip, token: `eg1~${clientToken}` });

  return clientToken;
}

export function createAccess(user: IUser | null, clientId: string, grant_type: string, deviceId: string, expiresIn: number): string {
  if (!user) throw new Error("User is null")
  const accessToken = jwt.sign(
    {
      app: "fortnite",
      sub: user.accountId,
      dvid: deviceId,
      mver: false,
      clid: clientId,
      dn: user.username,
      am: grant_type,
      p: Buffer.from(functions.MakeID()).toString("base64"),
      iai: user.accountId,
      sec: 1,
      clsvc: "fortnite",
      t: "s",
      ic: true,
      jti: functions.MakeID(),
      creation_date: new Date(),
      hours_expire: expiresIn,
    },
    g.JWT_SECRET,
    { expiresIn: `${expiresIn}h` }
  );

  g.accessTokens.push({ accountId: user.accountId, token: `eg1~${accessToken}` });

  return accessToken;
}

export function createRefresh(user: IUser | null, clientId: string, grant_type: string, deviceId: string, expiresIn: number): string {
  if (!user) throw new Error("User is null")
  const refreshToken = jwt.sign(
    {
      sub: user.accountId,
      dvid: deviceId,
      t: "r",
      clid: clientId,
      am: grant_type,
      jti: functions.MakeID(),
      creation_date: new Date(),
      hours_expire: expiresIn,
    },
    g.JWT_SECRET,
    { expiresIn: `${expiresIn}h` }
  );

  g.refreshTokens.push({ accountId: user.accountId, token: `eg1~${refreshToken}` });

  return refreshToken;
}

export async function verifyToken(c: Context, next: Next) {
  const authErr = () => error.createError(
    c,
    "errors.com.epicgames.common.authorization.authorization_failed",
    `Authorization failed for ${c.req.url}`,
    [c.req.url], 1032, undefined, 401
  );

  const authHeader = c.req.header("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer eg1~")) {
    return authErr();
  }

  const token = authHeader.slice("bearer eg1~".length);

  try {
    const decodedToken = jwt.decode(token) as TokenPayload | null;

    if (!decodedToken) throw new Error("Invalid token payload");

    const foundToken = g.accessTokens.find(i => i.token === `eg1~${token}`);
    if (!foundToken) throw new Error("Invalid token.");

    const creationDate = typeof decodedToken.creation_date === 'string'
      ? new Date(decodedToken.creation_date)
      : decodedToken.creation_date;

    if (DateAddHours(creationDate, decodedToken.hours_expire).getTime() <= Date.now()) {
      throw new Error("Expired access token.");
    }

    const user = await User.findOne({ accountId: decodedToken.sub }).lean<IUser>();
    if (!user) throw new Error("User not found");

    if (user.banned) {
      return error.createError(
        c,
        "errors.com.epicgames.account.account_not_active",
        "You have been permanently banned from Fortnite.",
        [], -1, undefined, 400
      );
    }

    c.set('user', user);
    await next();
  } catch {
    const accessIndex = g.accessTokens.findIndex(i => i.token === `eg1~${token}`);
    if (accessIndex !== -1) {
      g.accessTokens.splice(accessIndex, 1);
      UpdateTokens();
    }

    return authErr();
  }
}

export async function verifyClient(c: Context, next: Next) {
  const authErr = () => error.createError(
    c,
    "errors.com.epicgames.common.authorization.authorization_failed",
    `Authorization failed for ${c.req.url}`,
    [c.req.url], 1032, undefined, 401
  );

  const authHeader = c.req.header("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer eg1~")) {
    return authErr();
  }

  const token = authHeader.slice("bearer eg1~".length);

  try {
    const decodedToken = jwt.decode(token) as TokenPayload | null;
    if (!decodedToken) throw new Error("Invalid token payload");

    const findAccess = g.accessTokens.find(i => i.token === `eg1~${token}`);
    const findClient = g.clientTokens.find(i => i.token === `eg1~${token}`);

    if (!findAccess && !findClient) throw new Error("Invalid token.");

    const creationDate = typeof decodedToken.creation_date === 'string'
      ? new Date(decodedToken.creation_date)
      : decodedToken.creation_date;

    if (DateAddHours(creationDate, decodedToken.hours_expire).getTime() <= Date.now()) {
      throw new Error("Expired access/client token.");
    }

    if (findAccess) {
      const user = await User.findOne({ accountId: decodedToken.sub }).lean<IUser>();
      if (!user) throw new Error("User not found");

      if (user.banned) {
        return error.createError(
          c,
          "errors.com.epicgames.account.account_not_active",
          "You have been permanently banned from Fortnite.",
          [], -1, undefined, 400
        );
      }
      c.set('user', user);
    }

    await next();
  } catch {
    const accessIndex = g.accessTokens.findIndex(i => i.token === `eg1~${token}`);
    if (accessIndex !== -1) g.accessTokens.splice(accessIndex, 1);

    const clientIndex = g.clientTokens.findIndex(i => i.token === `eg1~${token}`);
    if (clientIndex !== -1) g.clientTokens.splice(clientIndex, 1);

    if (accessIndex !== -1 || clientIndex !== -1) UpdateTokens();

    return authErr();
  }
}

function DateAddHours(pdate: Date, number: number): Date {
  const date = new Date(pdate.getTime());
  date.setHours(date.getHours() + number);
  return date;
}

export function UpdateTokens(): void {
  const tokensData = {
    accessTokens: g.accessTokens,
    refreshTokens: g.refreshTokens,
    clientTokens: g.clientTokens,
  };

  fs.writeFileSync(
    "./src/tokens/tokens.json",
    JSON.stringify(tokensData, null, 2),
    "utf-8"
  );
}