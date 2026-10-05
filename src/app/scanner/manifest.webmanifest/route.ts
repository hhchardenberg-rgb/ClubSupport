/** Eigen manifest voor de Scanner-app: aparte naam, icoon, start-URL en scope. */
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      name: "HHC ClubSupport Scanner",
      short_name: "Scanner",
      description: "Ledenpassen controleren (online).",
      id: "/scanner",
      start_url: "/scanner",
      scope: "/scanner",
      display: "standalone",
      orientation: "portrait",
      lang: "nl",
      background_color: "#000000",
      theme_color: "#000000",
      icons: [
        { src: "/icons/scanner-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/scanner-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/scanner-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
