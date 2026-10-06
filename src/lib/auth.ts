import { passkey } from "@better-auth/passkey";
import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { db, schema } from "@/db";
import { env } from "./env";
import { onBackupCodeUsed, onLoginFailed, onMfaFailed, onPasswordLogin } from "@/server/security";

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export const auth = betterAuth({
  baseURL: env.appUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  appName: "HHC ClubSupport",
  trustedOrigins: [env.appUrl],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.authAccount,
      verification: schema.verification,
      twoFactor: schema.twoFactor,
      passkey: schema.passkey,
      rateLimit: schema.rateLimit,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Geen publieke registratie: accounts ontstaan alleen via beheer (uitnodiging + activatie).
    disableSignUp: true,
    minPasswordLength: PASSWORD_MIN,
    maxPasswordLength: PASSWORD_MAX,
    revokeSessionsOnPasswordReset: true,
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, input: false, defaultValue: "member" },
      disabledAt: { type: "date", required: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24, // absolute levensduur/sliding: 24 uur
    updateAge: 60 * 60,
    cookieCache: { enabled: false }, // intrekking moet direct werken
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 300, max: 5 },
      "/two-factor/verify-totp": { window: 300, max: 5 },
      "/two-factor/verify-backup-code": { window: 300, max: 5 },
      "/sign-in/passkey": { window: 300, max: 10 },
    },
  },
  advanced: {
    useSecureCookies: env.isProd,
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: env.isProd },
    ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
  },
  hooks: {
    // Beveiligingsmeldingen: nooit het inloggen zelf verstoren (fouten worden binnen de handlers opgevangen).
    after: createAuthMiddleware(async (ctx) => {
      const failed = ctx.context.returned instanceof APIError;
      const ip = (ctx.headers?.get("x-forwarded-for")?.split(",")[0] ?? ctx.headers?.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
      const body = (ctx.body ?? {}) as { email?: unknown; password?: unknown };
      if (ctx.path === "/sign-in/email") {
        if (failed) await onLoginFailed(body.email, ip);
        else {
          const uid = (ctx.context.newSession?.user ?? (ctx.context.returned as { user?: { id?: string } } | undefined)?.user)?.id;
          if (uid) await onPasswordLogin(uid, body.password);
        }
      } else if (failed && (ctx.path === "/two-factor/verify-totp" || ctx.path === "/two-factor/verify-backup-code")) {
        await onMfaFailed(ip);
      } else if (!failed && ctx.path === "/two-factor/verify-backup-code") {
        const uid = ctx.context.newSession?.user.id;
        if (uid) await onBackupCodeUsed(uid);
      }
    }),
  },
  plugins: [
    twoFactor({ issuer: "HHC ClubSupport" }),
    // Passkeys: gebruikersverificatie (PIN/biometrie) is verplicht, zodat een passkey als volwaardige tweede factor telt.
    passkey({
      rpID: new URL(env.appUrl).hostname,
      rpName: "HHC ClubSupport",
      origin: env.appUrl,
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      registration: {
        afterVerification: ({ verification }) => {
          if (!verification.registrationInfo?.userVerified) throw new APIError("BAD_REQUEST", { message: "Gebruikersverificatie (pincode of biometrie) is verplicht." });
        },
      },
      authentication: {
        afterVerification: ({ verification }) => {
          if (!verification.authenticationInfo?.userVerified) throw new APIError("UNAUTHORIZED", { message: "Gebruikersverificatie (pincode of biometrie) is verplicht." });
        },
      },
    }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
