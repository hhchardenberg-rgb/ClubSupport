"use client";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ to }: { to: string }) {
  return (
    <button
      type="button"
      className="secondary small"
      onClick={async () => {
        await authClient.signOut();
        window.location.assign(to);
      }}
    >
      Uitloggen
    </button>
  );
}
