"use client";

export function ConfirmSubmitButton({ children, message, className = "danger-button" }: { children: React.ReactNode; message: string; className?: string }) {
  return <button type="submit" className={className} onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }}>{children}</button>;
}
