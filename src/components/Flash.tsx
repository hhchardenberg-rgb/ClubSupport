export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (err) return <p role="alert" className="card error">{err}</p>;
  if (msg) return <p role="status" className="card">{msg}</p>;
  return null;
}
