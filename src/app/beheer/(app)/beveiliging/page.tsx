import { PageTitle } from "@/components/ui";
import { SecurityPanel } from "@/components/SecurityPanel";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Beveiliging" };

export default async function Page() {
  const s = await requireStaff("beheer", "members.read");
  return (
    <>
      <PageTitle title="Beveiliging" sub="Passkeys en herstelcodes voor je eigen account." />
      <SecurityPanel area="beheer" twoFactorEnabled={!!s.user.twoFactorEnabled} mfaRequired />
    </>
  );
}
