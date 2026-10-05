import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "HHC ClubSupport", template: "%s · HHC ClubSupport" },
  description: "Je digitale ledenpas van supportersvereniging HHC ClubSupport.",
};
export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

/** Dynamisch renderen is nodig: de CSP-nonce uit proxy.ts wordt alleen op scripts gezet bij per-verzoek-rendering. */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="nl">
      <body>
        <a href="#main" className="sr-only">Naar de inhoud</a>
        {children}
      </body>
    </html>
  );
}
