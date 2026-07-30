"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormWizard } from "@/components/form-wizard";

type SelectOption = { id: string; name: string };
type CouponDraft = {
  id?: string;
  code: string;
  description: string;
  maximumUsage: string;
  perCustomerLimit: string;
  expiresAt: string;
  isActive: boolean;
};

export type PromotionDraft = {
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT" | "BUY_X_GET_Y" | "FREE_ITEM" | "FREE_DELIVERY";
  targetType: "ORDER" | "PRODUCT" | "CATEGORY" | "BRANCH" | "RESTAURANT" | "COLLECTION";
  value: string;
  buyQuantity: string;
  getQuantity: string;
  freeProductId: string;
  minimumOrderValue: string;
  maximumDiscount: string;
  minimumQuantity: string;
  startsAt: string;
  endsAt: string;
  startTime: string;
  endTime: string;
  weekdays: number[];
  firstOrderOnly: boolean;
  newCustomersOnly: boolean;
  returningOnly: boolean;
  totalUsageLimit: string;
  perCustomerLimit: string;
  requiresCoupon: boolean;
  autoApply: boolean;
  allowStacking: boolean;
  stackingRule: "ALLOW" | "PREVENT" | "HIGHEST_WINS";
  priority: string;
  exclusive: boolean;
  isActive: boolean;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  productIds: string[];
  categoryIds: string[];
  branchIds: string[];
  coupons: CouponDraft[];
};

const emptyDraft: PromotionDraft = {
  name: "",
  nameAr: "",
  description: "",
  descriptionAr: "",
  type: "PERCENTAGE",
  targetType: "ORDER",
  value: "10",
  buyQuantity: "2",
  getQuantity: "1",
  freeProductId: "",
  minimumOrderValue: "",
  maximumDiscount: "",
  minimumQuantity: "",
  startsAt: "",
  endsAt: "",
  startTime: "",
  endTime: "",
  weekdays: [],
  firstOrderOnly: false,
  newCustomersOnly: false,
  returningOnly: false,
  totalUsageLimit: "",
  perCustomerLimit: "",
  requiresCoupon: false,
  autoApply: true,
  allowStacking: false,
  stackingRule: "HIGHEST_WINS",
  priority: "0",
  exclusive: false,
  isActive: true,
  status: "DRAFT",
  productIds: [],
  categoryIds: [],
  branchIds: [],
  coupons: [],
};

const optionalNumber = (value: string) =>
  value.trim() ? Number(value) : null;

export function PromotionForm({
  promotionId,
  initial,
  products,
  categories,
  branches,
}: {
  promotionId?: string;
  initial?: PromotionDraft;
  products: SelectOption[];
  categories: SelectOption[];
  branches: SelectOption[];
}) {
  const t = useTranslations("promotions.form");
  const types = useTranslations("promotions.types");
  const router = useRouter();
  const [draft, setDraft] = useState(initial || emptyDraft);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PromotionDraft>(
    key: K,
    value: PromotionDraft[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  const toggleId = (
    key: "productIds" | "categoryIds" | "branchIds",
    id: string,
  ) =>
    set(
      key,
      draft[key].includes(id)
        ? draft[key].filter((value) => value !== id)
        : [...draft[key], id],
    );
  const addCoupon = () =>
    set("coupons", [
      ...draft.coupons,
      {
        code: "",
        description: "",
        maximumUsage: "",
        perCustomerLimit: "",
        expiresAt: "",
        isActive: true,
      },
    ]);
  const updateCoupon = (index: number, patch: Partial<CouponDraft>) =>
    set(
      "coupons",
      draft.coupons.map((coupon, current) =>
        current === index ? { ...coupon, ...patch } : coupon,
      ),
    );
  const randomCode = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    return Array.from(bytes, (value) => value.toString(36))
      .join("")
      .slice(0, 10)
      .toUpperCase();
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      ...draft,
      value: Number(draft.value || 0),
      buyQuantity: optionalNumber(draft.buyQuantity),
      getQuantity: optionalNumber(draft.getQuantity),
      minimumOrderValue: optionalNumber(draft.minimumOrderValue),
      maximumDiscount: optionalNumber(draft.maximumDiscount),
      minimumQuantity: optionalNumber(draft.minimumQuantity),
      startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
      endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      totalUsageLimit: optionalNumber(draft.totalUsageLimit),
      perCustomerLimit: optionalNumber(draft.perCustomerLimit),
      priority: Number(draft.priority || 0),
      requiresCoupon: draft.coupons.length > 0 || draft.requiresCoupon,
      coupons: draft.coupons.map((coupon) => ({
        ...coupon,
        maximumUsage: optionalNumber(coupon.maximumUsage),
        perCustomerLimit: optionalNumber(coupon.perCustomerLimit),
        expiresAt: coupon.expiresAt
          ? new Date(coupon.expiresAt).toISOString()
          : null,
      })),
    };
    const response = await fetch(
      promotionId ? `/api/promotions/${promotionId}` : "/api/promotions",
      {
        method: promotionId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      setError(t("failed"));
      setSaving(false);
      return;
    }
    router.push("/dashboard/promotions?result=saved");
    router.refresh();
  }

  const checkboxList = (
    options: SelectOption[],
    key: "productIds" | "categoryIds" | "branchIds",
  ) => (
    <div className="promotion-choice-grid">
      {options.map((option) => (
        <label key={option.id}>
          <input
            type="checkbox"
            checked={draft[key].includes(option.id)}
            onChange={() => toggleId(key, option.id)}
          />
          {option.name}
        </label>
      ))}
    </div>
  );

  return (
    <form className="promotion-form dash-card" onSubmit={submit}>
      {error && <p className="review-result is-error">{error}</p>}
      <FormWizard
        stepTitles={[
          t("general"),
          t("type"),
          t("conditions"),
          t("target"),
          t("schedule"),
          t("limits"),
          t("preview"),
        ]}
        previousLabel={t("previous")}
        nextLabel={t("next")}
        finishLabel={saving ? t("saving") : t("save")}
      >
        <section className="promotion-step">
          <label>{t("name")}<input required value={draft.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label>{t("nameAr")}<input value={draft.nameAr} onChange={(e) => set("nameAr", e.target.value)} /></label>
          <label className="full">{t("description")}<textarea value={draft.description} onChange={(e) => set("description", e.target.value)} /></label>
          <label className="full">{t("descriptionAr")}<textarea value={draft.descriptionAr} onChange={(e) => set("descriptionAr", e.target.value)} /></label>
        </section>
        <section className="promotion-step">
          <label>{t("promotionType")}<select value={draft.type} onChange={(e) => set("type", e.target.value as PromotionDraft["type"])}>{(["PERCENTAGE","FIXED_AMOUNT","BUY_X_GET_Y","FREE_ITEM","FREE_DELIVERY"] as const).map((type) => <option value={type} key={type}>{types(type)}</option>)}</select></label>
          {!["FREE_ITEM", "FREE_DELIVERY"].includes(draft.type) && <label>{t("value")}<input type="number" min="0" step="0.01" value={draft.value} onChange={(e) => set("value", e.target.value)} /></label>}
          {draft.type === "BUY_X_GET_Y" && <><label>{t("buyQuantity")}<input type="number" min="1" value={draft.buyQuantity} onChange={(e) => set("buyQuantity", e.target.value)} /></label><label>{t("getQuantity")}<input type="number" min="1" value={draft.getQuantity} onChange={(e) => set("getQuantity", e.target.value)} /></label></>}
          {draft.type === "FREE_ITEM" && <label>{t("freeProduct")}<select value={draft.freeProductId} onChange={(e) => set("freeProductId", e.target.value)}><option value="">—</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>}
        </section>
        <section className="promotion-step">
          <label>{t("minimumOrder")}<input type="number" min="0" step="0.01" value={draft.minimumOrderValue} onChange={(e) => set("minimumOrderValue", e.target.value)} /></label>
          <label>{t("maximumDiscount")}<input type="number" min="0" step="0.01" value={draft.maximumDiscount} onChange={(e) => set("maximumDiscount", e.target.value)} /></label>
          <label>{t("minimumQuantity")}<input type="number" min="1" value={draft.minimumQuantity} onChange={(e) => set("minimumQuantity", e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={draft.firstOrderOnly} onChange={(e) => set("firstOrderOnly", e.target.checked)} />{t("firstOrder")}</label>
          <label className="check"><input type="checkbox" checked={draft.newCustomersOnly} onChange={(e) => set("newCustomersOnly", e.target.checked)} />{t("newCustomers")}</label>
          <label className="check"><input type="checkbox" checked={draft.returningOnly} onChange={(e) => set("returningOnly", e.target.checked)} />{t("returningCustomers")}</label>
        </section>
        <section className="promotion-step">
          <label>{t("targetType")}<select value={draft.targetType} onChange={(e) => set("targetType", e.target.value as PromotionDraft["targetType"])}><option value="ORDER">{t("order")}</option><option value="PRODUCT">{t("products")}</option><option value="CATEGORY">{t("categories")}</option><option value="BRANCH">{t("branches")}</option><option value="RESTAURANT">{t("restaurant")}</option></select></label>
          <div className="full">{draft.targetType === "PRODUCT" && checkboxList(products, "productIds")}{draft.targetType === "CATEGORY" && checkboxList(categories, "categoryIds")}{draft.targetType === "BRANCH" && checkboxList(branches, "branchIds")}</div>
        </section>
        <section className="promotion-step">
          <label>{t("startsAt")}<input type="datetime-local" value={draft.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></label>
          <label>{t("endsAt")}<input type="datetime-local" value={draft.endsAt} onChange={(e) => set("endsAt", e.target.value)} /></label>
          <label>{t("startTime")}<input type="time" value={draft.startTime} onChange={(e) => set("startTime", e.target.value)} /></label>
          <label>{t("endTime")}<input type="time" value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} /></label>
          <div className="full promotion-weekdays">{[0,1,2,3,4,5,6].map((day) => <label key={day}><input type="checkbox" checked={draft.weekdays.includes(day)} onChange={() => set("weekdays", draft.weekdays.includes(day) ? draft.weekdays.filter((value) => value !== day) : [...draft.weekdays, day])} />{t(`days.${day}`)}</label>)}</div>
        </section>
        <section className="promotion-step">
          <label>{t("totalUsage")}<input type="number" min="1" value={draft.totalUsageLimit} onChange={(e) => set("totalUsageLimit", e.target.value)} /></label>
          <label>{t("perCustomer")}<input type="number" min="1" value={draft.perCustomerLimit} onChange={(e) => set("perCustomerLimit", e.target.value)} /></label>
          <label>{t("priority")}<input type="number" value={draft.priority} onChange={(e) => set("priority", e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={draft.autoApply} onChange={(e) => set("autoApply", e.target.checked)} />{t("autoApply")}</label>
          <label className="check"><input type="checkbox" checked={draft.allowStacking} onChange={(e) => set("allowStacking", e.target.checked)} />{t("allowStacking")}</label>
          <label className="check"><input type="checkbox" checked={draft.exclusive} onChange={(e) => set("exclusive", e.target.checked)} />{t("exclusive")}</label>
          <div className="full coupon-editor"><button className="button ghost" type="button" onClick={addCoupon}>{t("addCoupon")}</button>{draft.coupons.map((coupon, index) => <div key={coupon.id || index}><input placeholder={t("couponCode")} value={coupon.code} onChange={(e) => updateCoupon(index, { code: e.target.value.toUpperCase() })} /><button type="button" className="button ghost" onClick={() => updateCoupon(index, { code: randomCode() })}>{t("generate")}</button><input placeholder={t("couponDescription")} value={coupon.description} onChange={(e) => updateCoupon(index, { description: e.target.value })} /><input type="number" min="1" placeholder={t("totalUsage")} value={coupon.maximumUsage} onChange={(e) => updateCoupon(index, { maximumUsage: e.target.value })} /><button type="button" className="button danger" onClick={() => set("coupons", draft.coupons.filter((_, current) => current !== index))}>×</button></div>)}</div>
        </section>
        <section className="promotion-step promotion-preview">
          <h2>{draft.name || t("createTitle")}</h2>
          <p>{types(draft.type)}</p>
          <strong>{draft.type === "PERCENTAGE" ? `${draft.value}%` : draft.value}</strong>
          <label>{t("status")}<select value={draft.status} onChange={(e) => set("status", e.target.value as PromotionDraft["status"])}>{(["DRAFT","ACTIVE","PAUSED","ARCHIVED"] as const).map((status)=><option key={status} value={status}>{t(`statuses.${status}`)}</option>)}</select></label>
        </section>
      </FormWizard>
    </form>
  );
}
