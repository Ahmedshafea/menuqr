"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { showSuccessToast } from "@/components/toast-provider";

export function BranchDeleteButton({ id }: { id: string }) {
  const t = useTranslations("branches");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      className="icon-danger"
      aria-label={t("delete")}
      disabled={loading}
      onClick={async () => {
        if (!window.confirm(t("deleteConfirm"))) return;
        setLoading(true);
        const response = await fetch(`/api/branches/${id}`, {
          method: "DELETE",
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          window.alert(
            result?.error?.code === "LAST_ACTIVE_BRANCH"
              ? t("lastActive")
              : t("invalid"),
          );
          setLoading(false);
          return;
        }
        showSuccessToast(t("deleted"));
        router.refresh();
      }}
    >
      <Trash2 />
    </button>
  );
}
