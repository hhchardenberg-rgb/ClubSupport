"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { previewImportAction } from "@/app/beheer/(app)/actions";

export function UploadForm() {
  const [state, action, pending] = useActionState(previewImportAction, {} as { error?: string; batchId?: string });
  const router = useRouter();
  useEffect(() => {
    if (state.batchId) router.push(`/beheer/import?batch=${state.batchId}`);
  }, [state.batchId, router]);
  return (
    <form action={action} className="card" aria-labelledby="up">
      <h2 id="up">1. Bestand kiezen</h2>
      <p className="muted">CSV (max 1 MB, 5000 rijen). Toegestane kolommen: <code>lidnummer</code>, <code>naam</code>, <code>email</code>, <code>notitie</code>. Verplicht: lidnummer en naam. Er wordt nog niets opgeslagen of gemaild.</p>
      <label htmlFor="file">CSV-bestand</label>
      <input id="file" name="file" type="file" accept=".csv,text/csv" required />
      {state.error && <p role="alert" className="error">{state.error}</p>}
      <p><button disabled={pending}>{pending ? "Controleren…" : "Preview tonen"}</button></p>
    </form>
  );
}
