export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      name: "HHC ClubSupport Ledenpas",
      short_name: "Ledenpas",
      description: "Je digitale ledenpas van HHC ClubSupport.",
      id: "/ledenpas",
      start_url: "/ledenpas",
      scope: "/ledenpas",
      display: "standalone",
      orientation: "portrait",
      lang: "nl",
      background_color: "#f2f2f2",
      theme_color: "#000000",
      icons: [
        { src: "/icons/ledenpas-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/ledenpas-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/ledenpas-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
