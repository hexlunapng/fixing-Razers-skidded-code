import { Hono } from "hono";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import User, { type IUser } from "../models/user";
import * as functions from '../utils/functions'
import * as tokens from '../tokens/tokenFunctions'
import * as error from '../utils/error'
import type { Env } from "../types/env";
import { getConnInfo } from "hono/bun";

const router = new Hono<Env>();

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

router.post('/account/api/oauth/token', async (c) => {
  let clientId: string | undefined

  try {
    const authHeader = c.req.header('authorization')
    if (!authHeader) throw new Error('Authorization header missing')
    const base64Part = authHeader.split(' ')[1];

    if (!base64Part) {
        throw new Error("Authorization header is missing or malformed");
    }

    clientId = functions.DecodeBase64(base64Part).split(':')[0]

    if (!clientId) throw new Error('Invalid client id')
  } catch {
    return error.createError(c,
      'errors.com.epicgames.common.oauth.invalid_client',
      'It appears that your Authorization header may be invalid or not present, please verify that you are sending the correct headers.',
      [],
      1011,
      'invalid_client',
      400
    )
  }

  interface TokenRequestBody {
    grant_type: string;
    username?: string;
    password?: string;
    refresh_token?: string;
  }

  let body: TokenRequestBody;
  const contentType = c.req.header("content-type") || "";

  if (contentType.includes("application/json")) {
    body = await c.req.json<TokenRequestBody>();
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await c.req.formData();
    body = {
      grant_type: formData.get("grant_type") as string,
      username: formData.get("username") as string | undefined,
      password: formData.get("password") as string | undefined,
      refresh_token: formData.get("refresh_token") as string | undefined,
    };
  } else {
    return c.json({ error: "Unsupported Content-Type" }, 415);
  }

  let user: IUser | null = null
  const grantType = body.grant_type

  try {
    switch (grantType) {
      case 'client_credentials': {
        let connInfo = getConnInfo(c)
        let ip = connInfo.remote.address || ''

        if (ip?.startsWith('::ffff:')) {
            ip = ip?.replace('::ffff:', '');
        }

        const clientTokenIndex = g.clientTokens.findIndex((i: any) => i.ip === ip)
        if (clientTokenIndex !== -1) g.clientTokens.splice(clientTokenIndex, 1)

        const token = tokens.createClient(clientId, grantType, ip, 4)

        tokens.UpdateTokens()

        const decodedClient = jwt.decode(token) as any

        return c.json({
          access_token: `eg1~${token}`,
          expires_in: Math.round((DateAddHours(new Date(decodedClient.creation_date), decodedClient.hours_expire).getTime() - Date.now()) / 1000),
          expires_at: DateAddHours(new Date(decodedClient.creation_date), decodedClient.hours_expire).toISOString(),
          token_type: 'bearer',
          client_id: clientId,
          internal_client: true,
          client_service: 'fortnite',
        })
      }

      case 'password': {
        if (!body.username || !body.password) {
          return error.createError(c,
            'errors.com.epicgames.common.oauth.invalid_request',
            'Username/password is required.',
            [],
            1013,
            'invalid_request',
            400
          )
        }

        const email = body.username.toLowerCase()
        const password = body.password

        user = await User.findOne({ email }).lean()

        const invalidCreds = () => error.createError(c,
          'errors.com.epicgames.account.invalid_account_credentials',
          'Your e-mail and/or password are incorrect. Please check them and try again.',
          [],
          18031,
          'invalid_grant',
          400
        )

        if (!user) return invalidCreds()

        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch) return invalidCreds()
        break
      }

      case 'refresh_token': {
        const refresh_token = body.refresh_token
        if (!refresh_token) {
          return error.createError(c,
            'errors.com.epicgames.common.oauth.invalid_request',
            'Refresh token is required.',
            [],
            1013,
            'invalid_request',
            400
          )
        }

        const refreshTokenIndex = g.refreshTokens.findIndex((i: any) => i.token === refresh_token)
        const object = g.refreshTokens[refreshTokenIndex]

        try {
          if (refreshTokenIndex === -1) throw new Error('Refresh token invalid.')

          const decodedRefreshToken = jwt.decode(refresh_token.replace('eg1~', '')) as any
          if (DateAddHours(new Date(decodedRefreshToken.creation_date), decodedRefreshToken.hours_expire).getTime() <= Date.now()) {
            throw new Error('Expired refresh token.')
          }
        } catch {
          if (refreshTokenIndex !== -1) {
            g.refreshTokens.splice(refreshTokenIndex, 1)

            tokens.UpdateTokens()
          }

          return error.createError(c,
            'errors.com.epicgames.account.auth_token.invalid_refresh_token',
            `Sorry the refresh token '${refresh_token}' is invalid`,
            [refresh_token],
            18036,
            'invalid_grant',
            400
          )
        }

        user = await User.findOne({ accountId: object?.accountId }).lean()
        break
      }

      default: {
        return error.createError(c,
          'errors.com.epicgames.common.oauth.unsupported_grant_type',
          `Unsupported grant type: ${grantType}`,
          [],
          1016,
          'unsupported_grant_type',
          400
        )
      }
    }

    if (user?.banned) {
      return error.createError(c,
        'errors.com.epicgames.account.account_not_active',
        'You have been permanently banned from Fortnite.',
        [],
        -1,
        undefined,
        400
      )
    }

    const memory = functions.GetVersionInfo(c.req)
    if (memory.build !== Number(process.env.VERSION)) {
      return error.createError(c,
        'errors.com.epicgames.common.version_not_active',
        'You are using an unsupported version.',
        [],
        -1,
        undefined,
        400
      )
    }

    const refreshIndex = g.refreshTokens.findIndex((i: any) => i.accountId === user?.accountId)
    if (refreshIndex !== -1) g.refreshTokens.splice(refreshIndex, 1)

    const accessIndex = g.accessTokens.findIndex((i: any) => i.accountId === user?.accountId)
    if (accessIndex !== -1) {
      g.accessTokens.splice(accessIndex, 1)

      tokens.UpdateTokens()
      const xmppClient = g.Clients.find((i: any) => i.accountId === user?.accountId)
      if (xmppClient) xmppClient.client.close()
    }

    const deviceId = functions.MakeID()
    const accessToken = tokens.createAccess(user, clientId, grantType, deviceId, 8)
    const refreshToken = tokens.createRefresh(user, clientId, grantType, deviceId, 24)

    tokens.UpdateTokens()

    const decodedAccess = jwt.decode(accessToken) as any
    const decodedRefresh = jwt.decode(refreshToken) as any

    return c.json({
      access_token: `eg1~${accessToken}`,
      expires_in: Math.round((DateAddHours(new Date(decodedAccess.creation_date), decodedAccess.hours_expire).getTime() - Date.now()) / 1000),
      expires_at: DateAddHours(new Date(decodedAccess.creation_date), decodedAccess.hours_expire).toISOString(),
      token_type: 'bearer',
      refresh_token: `eg1~${refreshToken}`,
      refresh_expires: Math.round((DateAddHours(new Date(decodedRefresh.creation_date), decodedRefresh.hours_expire).getTime() - Date.now()) / 1000),
      refresh_expires_at: DateAddHours(new Date(decodedRefresh.creation_date), decodedRefresh.hours_expire).toISOString(),
      account_id: user?.accountId,
      client_id: clientId,
      internal_client: true,
      client_service: 'fortnite',
      displayName: user?.username,
      app: 'fortnite',
      in_app_id: user?.accountId,
      device_id: deviceId,
    })
  } catch (err) {
    return error.createError(c,
      'errors.com.epicgames.common.oauth.server_error',
      'An unexpected error occurred.',
      [],
      500,
      'InternalServerError',
      500
    )
  }
})

router.get('/account/api/oauth/verify', tokens.verifyToken, async (c) => {
  const authHeader = c.req.header('authorization')
  if (!authHeader) {
    return error.createError(
      c,
      'errors.com.epicgames.common.authorization.authorization_failed',
      'Authorization header missing',
      [],
      1032,
      undefined,
      401
    )
  }

  const token = authHeader.replace('bearer ', '')
  const decodedToken = jwt.decode(token.replace('eg1~', '')) as any

  const user = c.get('user')

  const creationDate = typeof decodedToken.creation_date === 'string'
    ? new Date(decodedToken.creation_date)
    : decodedToken.creation_date

  const expiresAt = DateAddHours(creationDate, decodedToken.hours_expire)
  const expiresIn = Math.round((expiresAt.getTime() - Date.now()) / 1000)

  const memory = functions.GetVersionInfo(c.req)
    if (memory.build !== Number(process.env.VERSION)) {
      return error.createError(c,
        'errors.com.epicgames.common.version_not_active',
        'You are using an unsupported version.',
        [],
        -1,
        undefined,
        400
      )
    }

  return c.json({
    token,
    session_id: decodedToken.jti,
    token_type: 'bearer',
    client_id: decodedToken.clid,
    internal_client: true,
    client_service: 'fortnite',
    account_id: user.accountId,
    expires_in: expiresIn,
    expires_at: expiresAt.toISOString(),
    auth_method: decodedToken.am,
    display_name: user.username,
    app: 'fortnite',
    in_app_id: user.accountId,
    device_id: decodedToken.dvid
  })
})

router.delete('/account/api/oauth/sessions/kill', (c) => {
    return c.body(null, 204)
})

router.delete('/account/api/oauth/sessions/kill/:token', (c) => {
  const token = c.req.param('token')

  const accessIndex = g.accessTokens.findIndex(i => i.token === token)
  if (accessIndex !== -1) {
    const object = g.accessTokens[accessIndex]
    g.accessTokens.splice(accessIndex, 1)
    const xmppClient = g.Clients.find(i => i.token === object?.token)
    if (xmppClient) xmppClient.client.close()

    const refreshIndex = g.refreshTokens.findIndex(i => i.accountId === object?.accountId)
    if (refreshIndex !== -1) g.refreshTokens.splice(refreshIndex, 1)
  }

  const clientIndex = g.clientTokens.findIndex(i => i.token === token)
  if (clientIndex !== -1) g.clientTokens.splice(clientIndex, 1)

  if (accessIndex !== -1 || clientIndex !== -1) tokens.UpdateTokens()

  return c.body(null, 204)
})

router.post('/auth/v1/oauth/token', (c) => {
    return c.json({
        access_token: "razertoken",
        token_type: "bearer",
        expires_at: "9999-12-31T23:59:59.999Z",
        features: [
            "AntiCheat",
            "Connect",
            "Ecom"
        ],
        organization_id: "razerorgid",
        product_id: "prod-fn",
        sandbox_id: "fn",
        deployement_id: "razerdeployment",
        expires_in: 3599
    })
})

router.post('/epic/oauth/v2/token', async (c) => {
  let clientId: string | undefined;

  try {
    const authHeader = c.req.header('authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const base64Part = authHeader.split(' ')[1];

    if (!base64Part) {
        throw new Error("Authorization header is missing or malformed");
    }

    clientId = functions.DecodeBase64(base64Part).split(':')[0]

    if (!clientId) throw new Error('Invalid client id');
  } catch {
    return error.createError(
      c,
      'errors.com.epicgames.common.oauth.invalid_client',
      'It appears that your Authorization header may be invalid or not present, please verify that you are sending the correct headers.',
      [],
      1011,
      'invalid_client',
      400
    );
  }

  const body = await c.req.json<{ refresh_token?: string; scope?: string }>();

  if (!body.refresh_token) {
    return error.createError(
      c,
      'errors.com.epicgames.common.oauth.invalid_request',
      'Refresh token is required.',
      [],
      1013,
      'invalid_request',
      400
    );
  }

  const refresh_token = body.refresh_token;

  const refreshTokenIndex = g.refreshTokens.findIndex(i => i.token === refresh_token);
  const tokenObject = g.refreshTokens[refreshTokenIndex];

  try {
    if (refreshTokenIndex === -1) throw new Error('Refresh token invalid.');

    const decodedRefreshToken = jwt.decode(refresh_token.replace('eg1~', '')) as
      | { creation_date: string | Date; hours_expire: number }
      | null;

    if (!decodedRefreshToken) throw new Error('Invalid decoded token');

    const creationDate =
      typeof decodedRefreshToken.creation_date === 'string'
        ? new Date(decodedRefreshToken.creation_date)
        : decodedRefreshToken.creation_date;

    if (DateAddHours(creationDate, decodedRefreshToken.hours_expire).getTime() <= Date.now()) {
      throw new Error('Expired refresh token.');
    }
  } catch {
    if (refreshTokenIndex !== -1) {
      g.refreshTokens.splice(refreshTokenIndex, 1);
      tokens.UpdateTokens();
    }

    return error.createError(
      c,
      'errors.com.epicgames.account.auth_token.invalid_refresh_token',
      `Sorry the refresh token '${refresh_token}' is invalid`,
      [refresh_token],
      18036,
      'invalid_grant',
      400
    );
  }

  const user = (await User.findOne({ accountId: tokenObject?.accountId }).lean<IUser>())!;
  if (!user) {
    return error.createError(
      c,
      'errors.com.epicgames.account.user_not_found',
      'User not found',
      [],
      404,
      'not_found',
      404
    );
  }

  c.set('user', user);

  return c.json({
    scope: body.scope || 'basic_profile friends_list openid presence',
    token_type: 'bearer',
    access_token: 'razertoken',
    refresh_token: 'razerrefreshtoken',
    id_token: 'razeridtoken',
    expires_in: 7200,
    expires_at: '9999-12-31T23:59:59.999Z',
    refresh_expires_in: 28800,
    refresh_expires_at: '9999-12-31T23:59:59.999Z',
    account_id: user.accountId,
    client_id: clientId,
    application_id: 'razersacpplicationid',
    selected_account_id: user.accountId,
    merged_accounts: [],
  });
})

function DateAddHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

export default router