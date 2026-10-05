import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Scanner", template: "%s · Scanner" },
  manifest: "/scanner/manifest.webmanifest",
  icons: { icon: "/icons/scanner-192.png", apple: "/icons/apple-touch-scanner.png" },
  appleWebApp: { capable: true, title: "Scanner", statusBarStyle: "black" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
