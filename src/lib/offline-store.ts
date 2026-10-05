"use client";
import type { PassItem } from "@/components/PassCarousel";

/**
 * Offline-kopie van de eigen passen op het toestel van het lid (localStorage, alleen deze origin).
 * - Standaard aan na inloggen; uitzetten wist de kopie direct.
 * - Elke online weergave vervangt de hele kopie (ingetrokken/gedeactiveerde passen verdwijnen daardoor).
 * - Wordt gewist bij uitloggen en vervalt na `maxDays` dagen.
 * De scanner blijft de geldigheid altijd online bepalen; deze kopie is alleen een weergave.
 */
export const STORE_KEY = "hhc-ledenpas-offline-v1";
export const PREF_KEY = "hhc-ledenpas-offline-pref";

export type Stored = { savedAt: number; maxDays: number; items: PassItem[] };

const ok = (v: unknown): v is PassItem =>
  !!v && typeof v === "object" && typeof (v as PassItem).id === "string" && typeof (v as PassItem).name === "string" && typeof (v as PassItem).number === "string" && typeof (v as PassItem).active === "boolean" && ((v as PassItem).svg === null || typeof (v as PassItem).svg === "string");

export function offlineEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return false;
  }
}

export function setOfflineEnabled(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {}
  if (!on) clearOffline();
}

export function saveOffline(items: PassItem[], maxDays: number) {
  try {
    const data: Stored = { savedAt: Date.now(), maxDays, items };
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    /* opslag geblokkeerd of vol: dan geen offline kopie */
  }
}

export function clearOffline() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {}
}

/** Geeft de kopie terug, of een reden waarom die er niet is. */
export function loadOffline(): { state: "none" } | { state: "expired"; savedAt: number } | { state: "ok"; savedAt: number; items: PassItem[] } {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { state: "none" };
    const d = JSON.parse(raw) as Stored;
    if (!d || typeof d.savedAt !== "number" || typeof d.maxDays !== "number" || !Array.isArray(d.items) || !d.items.every(ok)) return { state: "none" };
    if (Date.now() - d.savedAt > d.maxDays * 86400_000) {
      clearOffline();
      return { state: "expired", savedAt: d.savedAt };
    }
    return { state: "ok", savedAt: d.savedAt, items: d.items };
  } catch {
    return { state: "none" };
  }
}
