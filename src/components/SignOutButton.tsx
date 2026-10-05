"use client";
import { authClient } from "@/lib/auth-client";
import { clearOffline } from "@/lib/offline-store";

export function SignOutButton({ to }: { to: string }) {
  return (
    <button
      type="button"
      className="secondary small"
      onClick={async () => {
        clearOffline(); // geen persoonlijke kopie achterlaten op het toestel
        await authClient.signOut();
        window.location.assign(to);
      }}
    >
      Uitloggen
    </button>
  );
}
