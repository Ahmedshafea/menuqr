"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import LocationField from "@/components/map/LocationField";
import { FormWizard } from "@/components/form-wizard";

type Hour = {
  dayOfWeek: number;
  opensAt: string | null;
  closesAt: string | null;
  isClosed: boolean;
};

export type BranchFormValue = {
  name: string;
  slug: string;
  isActive: boolean;
  phone: string;
  whatsappNumber: string;
  useRestaurantWhatsapp: boolean;
  email: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string;
  workingHours: Hour[];
};

const defaultHours = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  opensAt: "09:00",
  closesAt: "23:00",
  isClosed: false,
}));

const emptyBranch: BranchFormValue = {
  name: "",
  slug: "",
  isActive: true,
  phone: "",
  whatsappNumber: "",
  useRestaurantWhatsapp: true,
  email: "",
  address: "",
  city: "",
  state: "",
  country: "Egypt",
  postalCode: "",
  latitude: null,
  longitude: null,
  googleMapsUrl: "",
  workingHours: defaultHours,
};

export function BranchForm({
  branchId,
  initial,
}: {
  branchId?: string;
  initial?: Partial<BranchFormValue>;
}) {
  const router = useRouter();
  const t = useTranslations("branches");
  const common = useTranslations("common");
  const [value, setValue] = useState<BranchFormValue>({
    ...emptyBranch,
    ...initial,
    workingHours: initial?.workingHours?.length
      ? defaultHours.map(
          (fallback) =>
            initial.workingHours?.find(
              (hour) => hour.dayOfWeek === fallback.dayOfWeek,
            ) ?? fallback,
        )
      : defaultHours,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof BranchFormValue>(
    key: K,
    next: BranchFormValue[K],
  ) => setValue((current) => ({ ...current, [key]: next }));
  const updateHour = (day: number, patch: Partial<Hour>) =>
    set(
      "workingHours",
      value.workingHours.map((hour) =>
        hour.dayOfWeek === day ? { ...hour, ...patch } : hour,
      ),
    );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch(
      branchId ? `/api/branches/${branchId}` : "/api/branches",
      {
        method: branchId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      },
    );
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const code = result?.error?.code;
      setError(
        code === "BRANCH_SLUG_EXISTS"
          ? t("slugExists")
          : code === "LAST_ACTIVE_BRANCH"
            ? t("lastActive")
            : t("invalid"),
      );
      setLoading(false);
      return;
    }
    router.push(
      `/dashboard/branches?toast=${branchId ? "branchUpdated" : "branchCreated"}`,
    );
    router.refresh();
  }

  return (
    <form className="dash-card branch-form" onSubmit={submit}>
      <FormWizard
        stepTitles={[t("basic"), t("contact"), t("addressSection"), t("hours")]}
        previousLabel={common("previous")}
        nextLabel={common("next")}
        finishLabel={loading ? common("noData") : t("save")}
      >
        <section className="settings-grid">
          <label>
            {t("name")}
            <small>{t("nameHelp")}</small>
            <input
              required
              minLength={2}
              value={value.name}
              onChange={(event) => set("name", event.target.value)}
            />
          </label>
          <label>
            {t("slug")}
            <small>{t("slugHelp")}</small>
            <input
              required
              dir="ltr"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              value={value.slug}
              onChange={(event) =>
                set(
                  "slug",
                  event.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "-")
                    .replace(/-+/g, "-")
                    .replace(/^-|-$/g, ""),
                )
              }
            />
          </label>
          <label className="switch-line">
            <input
              type="checkbox"
              checked={value.isActive}
              onChange={(event) => set("isActive", event.target.checked)}
            />
            {t("active")}
          </label>
        </section>
        <section className="settings-grid">
          <label>
            {t("phone")}
            <input
              inputMode="tel"
              dir="ltr"
              value={value.phone}
              onChange={(event) => set("phone", event.target.value)}
            />
          </label>
          <label>
            {t("email")}
            <input
              type="email"
              dir="ltr"
              value={value.email}
              onChange={(event) => set("email", event.target.value)}
            />
          </label>
          <label className="switch-line full">
            <input
              type="checkbox"
              checked={value.useRestaurantWhatsapp}
              onChange={(event) =>
                set("useRestaurantWhatsapp", event.target.checked)
              }
            />
            {t("restaurantWhatsapp")}
          </label>
          {!value.useRestaurantWhatsapp && (
            <label className="full">
              {t("whatsapp")}
              <input
                required
                inputMode="tel"
                dir="ltr"
                value={value.whatsappNumber}
                onChange={(event) =>
                  set("whatsappNumber", event.target.value)
                }
              />
            </label>
          )}
        </section>
        <section className="settings-grid">
          <label className="full">
            {t("address")}
            <textarea
              required
              minLength={3}
              value={value.address}
              onChange={(event) => set("address", event.target.value)}
            />
          </label>
          <label>
            {t("country")}
            <input
              value={value.country}
              onChange={(event) => set("country", event.target.value)}
            />
          </label>
          <label>
            {t("city")}
            <input
              value={value.city}
              onChange={(event) => set("city", event.target.value)}
            />
          </label>
          <label>
            {t("state")}
            <input
              value={value.state}
              onChange={(event) => set("state", event.target.value)}
            />
          </label>
          <label>
            {t("postalCode")}
            <input
              value={value.postalCode}
              onChange={(event) => set("postalCode", event.target.value)}
            />
          </label>
          <label className="full">
            {t("googleMapsUrl")}
            <input
              type="url"
              dir="ltr"
              value={value.googleMapsUrl}
              onChange={(event) => set("googleMapsUrl", event.target.value)}
            />
          </label>
          <div className="full">
            <LocationField
              initialLat={value.latitude}
              initialLng={value.longitude}
              showGoogleLink
              onChange={(latitude, longitude) =>
                setValue((current) => ({
                  ...current,
                  latitude,
                  longitude,
                }))
              }
              onAddressResolved={(address, details) =>
                setValue((current) => ({
                  ...current,
                  address: current.address || address,
                  city: current.city || details.city || "",
                  state: current.state || details.governorate || "",
                  country: current.country || details.country || "",
                  postalCode: current.postalCode || details.postalCode || "",
                }))
              }
            />
          </div>
        </section>
        <section className="branch-hours">
          {value.workingHours.map((hour) => (
            <div key={hour.dayOfWeek} className="working-hour-row">
              <b>{t(`days.${hour.dayOfWeek}`)}</b>
              <label className="switch-line">
                <input
                  type="checkbox"
                  checked={hour.isClosed}
                  onChange={(event) =>
                    updateHour(hour.dayOfWeek, {
                      isClosed: event.target.checked,
                    })
                  }
                />
                {t("closed")}
              </label>
              <label>
                {t("opensAt")}
                <input
                  type="time"
                  required={!hour.isClosed}
                  disabled={hour.isClosed}
                  value={hour.opensAt ?? ""}
                  onChange={(event) =>
                    updateHour(hour.dayOfWeek, { opensAt: event.target.value })
                  }
                />
              </label>
              <label>
                {t("closesAt")}
                <input
                  type="time"
                  required={!hour.isClosed}
                  disabled={hour.isClosed}
                  value={hour.closesAt ?? ""}
                  onChange={(event) =>
                    updateHour(hour.dayOfWeek, { closesAt: event.target.value })
                  }
                />
              </label>
            </div>
          ))}
        </section>
      </FormWizard>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
