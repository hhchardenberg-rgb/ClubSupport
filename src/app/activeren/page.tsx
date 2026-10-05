import { SetPasswordForm } from "@/components/AccountForms";
import { SiteHeader } from "@/components/SiteHeader";
import { isLinkUsable } from "@/server/activation";

export const metadata = { title: "Account activeren" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = await isLinkUsable(token, "activation");
  return (
    <>
      <SiteHeader />
      <main id="main">
        <h1>Account activeren</h1>
        {ok && token ? (
          <SetPasswordForm token={token} purpose="activation" />
        ) : (
          <div className="card" role="alert"><p>Deze link is ongeldig of verlopen. Vraag een beheerder om een nieuwe uitnodiging.</p></div>
        )}
      </main>
    </>
  );
}
