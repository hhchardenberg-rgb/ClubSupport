import type { Metadata } from "next";

export const metadata: Metadata = {
  manifest: "/ledenpas/manifest.webmanifest",
  icons: { icon: "/icons/ledenpas-192.png", apple: "/icons/apple-touch-ledenpas.png" },
  appleWebApp: { capable: true, title: "Ledenpas", statusBarStyle: "black" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
