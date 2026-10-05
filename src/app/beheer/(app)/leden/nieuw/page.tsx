import { NewMemberForm } from "@/components/NewMemberForm";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Nieuw lid" };

export default async function Page() {
  await requireStaff("beheer", "passes.manage");
  return (
    <>
      <h1>Nieuw lid</h1>
      <p className="muted">Er wordt direct een pas met een unieke QR-code aangemaakt en een onboardingmail klaargezet.</p>
      <NewMemberForm />
    </>
  );
}
