"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormWizard } from "@/components/form-wizard";
import { ChevronDown, Lightbulb, X } from "lucide-react";

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
  isActive: false,
  status: "DRAFT",
  productIds: [],
  categoryIds: [],
  branchIds: [],
  coupons: [],
};

const optionalNumber = (value: string) =>
  value.trim() ? Number(value) : null;
const dateBoundary = (value: string, end = false) =>
  value
    ? new Date(`${value.slice(0, 10)}T${end ? "23:59:59.999" : "00:00:00"}`).toISOString()
    : null;

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
  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);
  const explicitSaveRef = useRef(false);
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
  const typeHelp: Record<PromotionDraft["type"], string> = {
    PERCENTAGE: t("percentageHelp"),
    FIXED_AMOUNT: t("fixedHelp"),
    BUY_X_GET_Y: t("buyGetHelp"),
    FREE_ITEM: t("freeItemHelp"),
    FREE_DELIVERY: t("freeDeliveryHelp"),
  };
  const audience = draft.firstOrderOnly ? "FIRST_ORDER" : draft.newCustomersOnly ? "NEW" : draft.returningOnly ? "RETURNING" : "EVERYONE";
  const setAudience = (value: string) => setDraft((current) => ({
    ...current,
    firstOrderOnly: value === "FIRST_ORDER",
    newCustomersOnly: value === "NEW",
    returningOnly: value === "RETURNING",
  }));
  const Tip = ({ children }: { children: React.ReactNode }) => <aside className="promotion-tip"><Lightbulb /><p>{children}</p></aside>;
  const promotionValueLabel = draft.type === "PERCENTAGE"
    ? `${draft.value}%`
    : draft.type === "FIXED_AMOUNT"
      ? draft.value
      : draft.type === "BUY_X_GET_Y"
        ? `${draft.buyQuantity} + ${draft.getQuantity}`
        : draft.type === "FREE_ITEM"
          ? products.find((product) => product.id === draft.freeProductId)?.name || types("FREE_ITEM")
          : types("FREE_DELIVERY");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!explicitSaveRef.current) return;
    explicitSaveRef.current = false;
    if (submittingRef.current) return;
    submittingRef.current = true;
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
      startsAt: dateBoundary(draft.startsAt),
      endsAt: dateBoundary(draft.endsAt, true),
      startTime: draft.startTime || null,
      endTime: draft.endTime || null,
      freeProductId: draft.freeProductId || null,
      totalUsageLimit: optionalNumber(draft.totalUsageLimit),
      perCustomerLimit: optionalNumber(draft.perCustomerLimit),
      priority: Number(draft.priority || 0),
      isActive: draft.status === "ACTIVE",
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
      const result = await response.json().catch(() => null) as {
        error?: { code?: string; details?: Record<string, string[]> };
      } | null;
      const code = result?.error?.code;
      const fields = result?.error?.details;
      const invalidField = fields
        ? Object.keys(fields).find((field) => fields[field]?.length)
        : undefined;
      const fieldLabels: Record<string, string> = {
        name: t("name"),
        type: t("promotionType"),
        value: t("value"),
        buyQuantity: t("buyQuantity"),
        getQuantity: t("getQuantity"),
        freeProductId: t("freeProduct"),
        minimumOrderValue: t("minimumOrder"),
        maximumDiscount: t("maximumDiscount"),
        minimumQuantity: t("minimumQuantity"),
        startsAt: t("startsAt"),
        endsAt: t("endsAt"),
        startTime: t("startTime"),
        endTime: t("endTime"),
        coupons: t("couponCode"),
        productIds: t("products"),
        categoryIds: t("categories"),
        branchIds: t("branches"),
      };
      setError(
        code === "COUPON_ALREADY_EXISTS"
          ? t("couponExists")
          : code === "INVALID_PROMOTION_TARGET"
            ? t("invalidTarget")
            : invalidField
              ? t("fieldError", { field: fieldLabels[invalidField] || invalidField })
              : t("failed"),
      );
      setSaving(false);
      submittingRef.current = false;
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
    <form ref={formRef} className="promotion-form dash-card" onSubmit={submit}>
      {error && <p className="review-result is-error">{error}</p>}
      <p className="promotion-intro">{t("setupIntro")}</p>
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
        onFinish={() => {
          if (saving || submittingRef.current) return;
          explicitSaveRef.current = true;
          formRef.current?.requestSubmit();
        }}
      >
        <section className="promotion-step">
          <Tip>{t("generalTip")}</Tip>
          <p className="full promotion-language-help">{t("languageHelp")}</p>
          <label>{t("name")}<input required value={draft.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label>{t("nameAr")}<input value={draft.nameAr} onChange={(e) => set("nameAr", e.target.value)} /></label>
        </section>
        <section className="promotion-step">
          <Tip>{t("typeTip")}</Tip>
          <label>{t("promotionType")}<select value={draft.type} onChange={(e) => set("type", e.target.value as PromotionDraft["type"])}>{(["PERCENTAGE","FIXED_AMOUNT","BUY_X_GET_Y","FREE_ITEM","FREE_DELIVERY"] as const).map((type) => <option value={type} key={type}>{types(type)}</option>)}</select></label>
          <div className="promotion-type-help"><strong>{types(draft.type)}</strong><p>{typeHelp[draft.type]}</p></div>
          {draft.type === "PERCENTAGE" && <label>{t("valuePercentage")}<input required type="number" min="0.01" max="100" step="0.01" value={draft.value} onChange={(e) => set("value", e.target.value)} /></label>}
          {draft.type === "FIXED_AMOUNT" && <label>{t("valueFixed")}<input required type="number" min="0.01" step="0.01" value={draft.value} onChange={(e) => set("value", e.target.value)} /></label>}
          {draft.type === "BUY_X_GET_Y" && <><label>{t("buyQuantity")}<input required type="number" min="1" value={draft.buyQuantity} onChange={(e) => set("buyQuantity", e.target.value)} /></label><label>{t("getQuantity")}<input required type="number" min="1" max={Math.max(1, Number(draft.buyQuantity) || 1)} value={draft.getQuantity} onChange={(e) => set("getQuantity", e.target.value)} /></label></>}
          {draft.type === "FREE_ITEM" && <label>{t("freeProduct")}<select required value={draft.freeProductId} onChange={(e) => set("freeProductId", e.target.value)}><option value="">—</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>}
        </section>
        <section className="promotion-step">
          <Tip>{t("conditionsTip")}</Tip>
          <label>{t("minimumOrder")}<input type="number" min="0" step="0.01" value={draft.minimumOrderValue} onChange={(e) => set("minimumOrderValue", e.target.value)} /></label>
          {draft.type === "PERCENTAGE" && <label>{t("maximumDiscount")}<input type="number" min="0" step="0.01" value={draft.maximumDiscount} onChange={(e) => set("maximumDiscount", e.target.value)} /></label>}
          {["BUY_X_GET_Y", "FREE_ITEM"].includes(draft.type) && <label>{t("minimumQuantity")}<input type="number" min="1" value={draft.minimumQuantity} onChange={(e) => set("minimumQuantity", e.target.value)} /></label>}
          <label>{t("audience")}<select value={audience} onChange={(e) => setAudience(e.target.value)}><option value="EVERYONE">{t("everyone")}</option><option value="FIRST_ORDER">{t("firstOrderAudience")}</option><option value="NEW">{t("newAudience")}</option><option value="RETURNING">{t("returningAudience")}</option></select></label>
        </section>
        <section className="promotion-step">
          <Tip>{t("targetTip")}</Tip>
          <label>{t("targetType")}<select value={draft.targetType} onChange={(e) => set("targetType", e.target.value as PromotionDraft["targetType"])}><option value="ORDER">{t("order")}</option><option value="PRODUCT">{t("products")}</option><option value="CATEGORY">{t("categories")}</option><option value="BRANCH">{t("branches")}</option><option value="RESTAURANT">{t("restaurant")}</option></select></label>
          <div className="full">{draft.targetType === "PRODUCT" && checkboxList(products, "productIds")}{draft.targetType === "CATEGORY" && checkboxList(categories, "categoryIds")}{draft.targetType === "BRANCH" && checkboxList(branches, "branchIds")}</div>
        </section>
        <section className="promotion-step">
          <Tip>{t("scheduleTip")}</Tip>
          <label>{t("startsAt")}<input type="date" value={draft.startsAt.slice(0, 10)} onChange={(e) => set("startsAt", e.target.value)} /></label>
          <label>{t("endsAt")}<input type="date" value={draft.endsAt.slice(0, 10)} onChange={(e) => set("endsAt", e.target.value)} /></label>
          <div className="promotion-time-field"><label>{t("startTime")}<input type="time" value={draft.startTime} onChange={(e) => set("startTime", e.target.value)} /></label><button type="button" className="clear-time-button" onClick={(event) => { const input = event.currentTarget.parentElement?.querySelector<HTMLInputElement>("input"); if (input) input.value = ""; set("startTime", ""); }}><X />{t("clearTime")}</button></div>
          <div className="promotion-time-field"><label>{t("endTime")}<input type="time" value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} /></label><button type="button" className="clear-time-button" onClick={(event) => { const input = event.currentTarget.parentElement?.querySelector<HTMLInputElement>("input"); if (input) input.value = ""; set("endTime", ""); }}><X />{t("clearTime")}</button></div>
          {!draft.startTime && !draft.endTime && <p className="full all-day-note">{t("allDay")}</p>}
          <div className="full promotion-weekdays">{[0,1,2,3,4,5,6].map((day) => <label key={day}><input type="checkbox" checked={draft.weekdays.includes(day)} onChange={() => set("weekdays", draft.weekdays.includes(day) ? draft.weekdays.filter((value) => value !== day) : [...draft.weekdays, day])} />{t(`days.${day}`)}</label>)}</div>
        </section>
        <section className="promotion-step">
          <Tip>{t("limitsTip")}</Tip>
          <label>{t("totalUsage")}<input type="number" min="1" value={draft.totalUsageLimit} onChange={(e) => set("totalUsageLimit", e.target.value)} /></label>
          <label>{t("perCustomer")}<input type="number" min="1" value={draft.perCustomerLimit} onChange={(e) => set("perCustomerLimit", e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={draft.autoApply} onChange={(e) => set("autoApply", e.target.checked)} />{t("autoApply")}</label>
          <details className="full promotion-advanced"><summary>{t("optional")}<ChevronDown /></summary><div>
          <label>{t("priority")}<input type="number" value={draft.priority} onChange={(e) => set("priority", e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={draft.allowStacking} onChange={(e) => set("allowStacking", e.target.checked)} />{t("allowStacking")}</label>
          <label className="check"><input type="checkbox" checked={draft.exclusive} onChange={(e) => set("exclusive", e.target.checked)} />{t("exclusive")}</label>
          <div className="full coupon-editor"><button className="button ghost" type="button" onClick={addCoupon}>{t("addCoupon")}</button>{draft.coupons.map((coupon, index) => <div key={coupon.id || index}><input placeholder={t("couponCode")} value={coupon.code} onChange={(e) => updateCoupon(index, { code: e.target.value.toUpperCase() })} /><button type="button" className="button ghost" onClick={() => updateCoupon(index, { code: randomCode() })}>{t("generate")}</button><input placeholder={t("couponDescription")} value={coupon.description} onChange={(e) => updateCoupon(index, { description: e.target.value })} /><input type="number" min="1" placeholder={t("totalUsage")} value={coupon.maximumUsage} onChange={(e) => updateCoupon(index, { maximumUsage: e.target.value })} /><button type="button" className="button danger" onClick={() => set("coupons", draft.coupons.filter((_, current) => current !== index))}>×</button></div>)}</div>
          </div></details>
        </section>
        <section className="promotion-step promotion-preview">
          <Tip>{t("reviewTip")}</Tip>
          <h2>{draft.name || t("createTitle")}</h2>
          <p>{types(draft.type)}</p>
          <strong>{promotionValueLabel}</strong>
          <p>{t("summaryScope", { scope: draft.targetType === "ORDER" ? t("order") : draft.targetType === "PRODUCT" ? t("products") : draft.targetType === "CATEGORY" ? t("categories") : draft.targetType === "BRANCH" ? t("branches") : t("restaurant") })}</p>
          <label>{t("status")}<select value={draft.status} onChange={(e) => { const status = e.target.value as PromotionDraft["status"]; set("status", status); set("isActive", status === "ACTIVE"); }}>{(["DRAFT","ACTIVE","PAUSED","ARCHIVED"] as const).map((status)=><option key={status} value={status}>{t(`statuses.${status}`)}</option>)}</select><small>{t("statusHelp")}</small></label>
        </section>
      </FormWizard>
    </form>
  );
}
