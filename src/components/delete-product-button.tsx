"use client";

import { Trash2 } from "lucide-react";

type Props = {
  id: string;
  action: (formData: FormData) => void | Promise<void>;
  label: string;
  confirmation: string;
};

export function DeleteProductButton({
  id,
  action,
  label,
  confirmation,
}: Props) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="icon-danger" aria-label={label} title={label}>
        <Trash2 />
      </button>
    </form>
  );
}
