"use client";

export function RemoveDomainButton({ action, label, confirmation }: { action: () => Promise<void>; label: string; confirmation: string }) {
  return <form action={action} onSubmit={(event) => { if (!window.confirm(confirmation)) event.preventDefault(); }}><button className="button danger" type="submit">{label}</button></form>;
}
