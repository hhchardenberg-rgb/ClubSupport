"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/ratelimit";
import { unsubscribeByToken } from "@/server/newsletter";

export async function unsubscribeAction(f: FormData) {
  const token = String(f.get("token") ?? "").slice(0, 100);
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
  if (await rateLimit(`unsub:${ip}`, 30, 3600)) await unsubscribeByToken(token);
  redirect(`/afmelden/${encodeURIComponent(token)}?klaar=1`);
}
