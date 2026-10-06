import { NewMemberForm } from "@/components/NewMemberForm";
import { PageTitle } from "@/components/ui";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Nieuw lid" };

export default async function Page() {
  await requireStaff("beheer", "members.write");
  await requireStaff("beheer", "passes.manage");
  return (
    <>
      <PageTitle title="Nieuw lid" sub="Er wordt direct een pas met een unieke QR-code aangemaakt en een onboardingmail klaargezet." />
      <NewMemberForm />
    </>
  );
}
