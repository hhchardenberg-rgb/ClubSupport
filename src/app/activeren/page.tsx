import { SetPasswordForm } from "@/components/AccountForms";
import { AuthShell } from "@/components/AuthShell";
import { isLinkUsable } from "@/server/activation";

export const metadata = { title: "Account activeren" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = await isLinkUsable(token, "activation");
  return (
    <AuthShell title="Account activeren" sub="Kies een wachtwoord om je account te gebruiken.">
      {ok && token ? <SetPasswordForm token={token} purpose="activation" /> : <div className="card" role="alert"><p>Deze link is ongeldig of verlopen. Vraag een beheerder om een nieuwe uitnodiging.</p></div>}
    </AuthShell>
  );
}
