import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "@/components/LoginForm";
import { RegisterLedenpasSW } from "@/components/RegisterSW";

export const metadata = { title: "Inloggen" };

export default function Page() {
  return (
    <AuthShell>
      <RegisterLedenpasSW />
      <LoginForm area="ledenpas" />
    </AuthShell>
  );
}
