import { ForgotForm } from "@/components/AccountForms";
import { AuthShell } from "@/components/AuthShell";

export const metadata = { title: "Wachtwoord vergeten" };

export default function Page() {
  return (
    <AuthShell title="Wachtwoord vergeten" sub="We sturen een link naar het e-mailadres van je account.">
      <ForgotForm />
    </AuthShell>
  );
}
