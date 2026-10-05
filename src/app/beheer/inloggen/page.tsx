import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Inloggen Beheer" };

export default function Page() {
  return (
    <main id="main">
      <h1>Beheer</h1>
      <LoginForm area="beheer" />
    </main>
  );
}
