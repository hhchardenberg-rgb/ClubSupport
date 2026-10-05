import { OfflinePasses } from "@/components/OfflinePasses";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Offline" };

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <h1>Ledenpas</h1>
        <OfflinePasses />
      </main>
    </>
  );
}
