export const NEWSLETTER_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "plain" }> = {
  draft: { label: "Concept", tone: "plain" },
  scheduled: { label: "Gepland", tone: "warn" },
  sending: { label: "Wordt verstuurd", tone: "warn" },
  sent: { label: "Verstuurd", tone: "ok" },
  cancelled: { label: "Geannuleerd", tone: "bad" },
};
