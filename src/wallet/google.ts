import "server-only";
import { SignJWT, importPKCS8 } from "jose";
import { GoogleAuth } from "google-auth-library";
import { env } from "@/lib/env";
import { WalletNotConfigured } from "./apple";

type ServiceAccount = { client_email: string; private_key: string };

export function googleConfig() {
  const e = process.env;
  const missing = ["GOOGLE_WALLET_ISSUER_ID", "GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_BASE64"].filter((k) => !e[k]);
  if (missing.length) throw new WalletNotConfigured("google", missing);
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(Buffer.from(e.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_BASE64!, "base64").toString("utf8"));
  } catch {
    throw new WalletNotConfigured("google", ["GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_BASE64 (ongeldig)"]);
  }
  if (!sa.client_email || !sa.private_key) throw new WalletNotConfigured("google", ["GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_BASE64 (client_email/private_key ontbreekt)"]);
  const issuerId = e.GOOGLE_WALLET_ISSUER_ID!;
  return { issuerId, sa, classId: `${issuerId}.hhc_clubsupport_ledenpas` };
}

const API = "https://walletobjects.googleapis.com/walletobjects/v1";

export function genericObject(cfg: ReturnType<typeof googleConfig>, input: { passId: string; name: string; memberNumber: string; token: string }) {
  return {
    id: `${cfg.issuerId}.${input.passId.replace(/-/g, "")}`, // pas-id, niet de token
    classId: cfg.classId,
    state: "ACTIVE",
    cardTitle: { defaultValue: { language: "nl", value: "HHC ClubSupport" } },
    header: { defaultValue: { language: "nl", value: input.name } },
    subheader: { defaultValue: { language: "nl", value: "Ledenpas" } },
    textModulesData: [{ id: "memberNumber", header: "LIDNUMMER", body: input.memberNumber }],
    barcode: { type: "QR_CODE", value: input.token }, // geen alternateText: toont anders de token
    hexBackgroundColor: "#000000",
  };
}

/** Maakt de pasklasse aan als die nog niet bestaat (idempotent). */
async function ensureClass(cfg: ReturnType<typeof googleConfig>) {
  const auth = new GoogleAuth({ credentials: cfg.sa, scopes: ["https://www.googleapis.com/auth/wallet_object.issuer"] });
  const client = await auth.getClient();
  const url = `${API}/genericClass/${encodeURIComponent(cfg.classId)}`;
  try {
    await client.request({ url, method: "GET" });
  } catch (e) {
    const status = (e as { response?: { status?: number } }).response?.status;
    if (status !== 404) throw e;
    await client.request({ url: `${API}/genericClass`, method: "POST", data: { id: cfg.classId } });
  }
  return client;
}

/** "Opslaan in Google Wallet"-link: JWT (RS256) met het object, ondertekend met de service account-sleutel. */
export async function buildGoogleSaveUrl(input: { passId: string; name: string; memberNumber: string; token: string }) {
  const cfg = googleConfig();
  await ensureClass(cfg);
  const obj = genericObject(cfg, input);
  const key = await importPKCS8(cfg.sa.private_key, "RS256");
  const jwt = await new SignJWT({ iss: cfg.sa.client_email, aud: "google", typ: "savetowallet", origins: [env.appUrl], payload: { genericObjects: [obj] } })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuedAt()
    .sign(key);
  return { url: `https://pay.google.com/gp/v/save/${jwt}`, objectId: obj.id };
}

/** Best effort: zet het Wallet-object op ACTIVE/INACTIVE. NIET leidend; de online scanner dwingt de status af. */
export async function setGoogleObjectState(objectId: string, state: "ACTIVE" | "INACTIVE"): Promise<void> {
  let cfg;
  try {
    cfg = googleConfig();
  } catch {
    return; // niet geconfigureerd: niets te synchroniseren
  }
  const auth = new GoogleAuth({ credentials: cfg.sa, scopes: ["https://www.googleapis.com/auth/wallet_object.issuer"] });
  const client = await auth.getClient();
  await client.request({ url: `${API}/genericObject/${encodeURIComponent(objectId)}`, method: "PATCH", data: { state } });
}
