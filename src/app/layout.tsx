import type { Metadata, Viewport } from "next";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/900.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "HHC ClubSupport", template: "%s · HHC ClubSupport" },
  description: "Ledenpas, Scanner en Beheer van supportersvereniging HHC ClubSupport.",
};
export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <a href="#main" className="sr-only">Naar de inhoud</a>
        {children}
      </body>
    </html>
  );
}
