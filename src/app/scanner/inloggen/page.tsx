import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Inloggen" };

export default function Page() {
  return (
    <AuthShell area="scanner">
      <LoginForm area="scanner" />
    </AuthShell>
  );
}
