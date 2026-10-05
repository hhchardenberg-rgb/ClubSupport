import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Inloggen Scanner" };

export default function Page() {
  return (
    <main id="main">
      <h1>Scanner</h1>
      <LoginForm area="scanner" />
    </main>
  );
}
