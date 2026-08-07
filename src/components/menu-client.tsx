"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Heart, LayoutGrid, List, MapPin, Minus, Plus, Search, ShoppingBag, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Image from "next/image";
import LocationField from "@/components/map/LocationField";
import { calculateOrderPricing } from "@/lib/order-pricing";
import { compactBranchLocation } from "@/lib/branch-display";
const TurnstileWidget = dynamic(
  () =>
    import("@/components/turnstile-widget").then(
      (module) => module.TurnstileWidget,
    ),
  { ssr: false },
);
export type MenuProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  discountedPrice?: number | null;
  promotionLabel?: string | null;
  category: string;
  image: string;
  featured?: boolean;
  available: boolean;
  extras: { id: string; name: string; price: number }[];
  optionGroups: { id:string; name:string; required:boolean; min:number; max:number; options:{id:string;name:string;price:number}[] }[];
};
export function MenuClient({
  restaurant,
  products,
  promotionBanners = [],
  orderingEnabled = true,
  initialCart = {},
  initialSelectedExtras = {},
  initialOpen = false,
  customerDefaults,
  branches = [],
  initialBranchId,
  branchLocked = false,
  demo = false,
}: {
  restaurant: {
    name: string;
    phone?: string | null;
    slug: string;
    currency: string;
    estimatedMinutes: number;
    fulfillment:{delivery:boolean;pickup:boolean;dineIn:boolean};
    pricing:{deliveryFee:number;deliveryFeeType:string;serviceFee:number;serviceFeeType:string;taxRate:number;taxType:string};
  };
  products: MenuProduct[];
  promotionBanners?: Array<{ id: string; name: string; coupon?: string }>;
  orderingEnabled?: boolean;
  initialCart?: Record<string, number>;
  initialSelectedExtras?: Record<string, string[]>;
  initialOpen?: boolean;
  customerDefaults?: { name: string; phone: string; address: string; addresses: { id: string; title: string; address: string; latitude: number | null; longitude: number | null; isDefault: boolean }[] };
  branches?: Array<{ id: string; name: string; slug: string; address: string; city?: string | null }>;
  initialBranchId?: string;
  branchLocked?: boolean;
  demo?: boolean;
}) {
  const t = useTranslations("publicMenu");
  const accountT = useTranslations("customerAccount.checkout");
  const common = useTranslations("common");
  const productText = useTranslations("mvpPolish.products");
  const demoText = useTranslations("demo");
  const validationText = useTranslations("restaurantWorkflow.validation");
  const optionText = useTranslations("productFormOptions");
  const mapsText = useTranslations("maps");
  const checkoutText = useTranslations("checkoutUx");
  const productDetailsText = useTranslations("productDetails");
  const promotionText = useTranslations("promotions.checkout");
  const branchText = useTranslations("branches");
  const locale = useLocale();
  const defaultFulfillment = restaurant.fulfillment.delivery
    ? "DELIVERY"
    : restaurant.fulfillment.pickup
      ? "PICKUP"
      : "DINE_IN";
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("__all");
  const [cart, setCart] = useState<Record<string, number>>(initialCart);
  const [open, setOpen] = useState(initialOpen);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<"DELIVERY" | "PICKUP" | "DINE_IN">(defaultFulfillment);
  const [createAccount, setCreateAccount] = useState(false);
  const [selectedExtras, setSelectedExtras] =
    useState<Record<string, string[]>>(initialSelectedExtras);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [demoPreview, setDemoPreview] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<MenuProduct | null>(null);
  const [checkoutStep, setCheckoutStep] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [promotionPricing, setPromotionPricing] = useState<ReturnType<typeof calculateOrderPricing> | null>(null);
  const [appliedPromotions, setAppliedPromotions] = useState<Array<{id:string;name:string;nameAr?:string|null;discountAmount:number;freeDelivery:boolean}>>([]);
  const [selectedBranchId, setSelectedBranchId] = useState(
    initialBranchId ?? (branches.length === 1 ? branches[0]?.id ?? "" : ""),
  );
  const selectedBranch = branches.find(
    (branch) => branch.id === selectedBranchId,
  );
  useEffect(() => {
    const saved = window.localStorage.getItem("menuqr-menu-view");
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);
  useEffect(() => {
    if (branchLocked || initialBranchId || branches.length <= 1) return;
    const stored = window.sessionStorage.getItem(
      `menuqr-branch:${restaurant.slug}`,
    );
    if (stored && branches.some((branch) => branch.id === stored))
      setSelectedBranchId(stored);
  }, [branchLocked, branches, initialBranchId, restaurant.slug]);
  useEffect(() => {
    if (selectedBranchId)
      window.sessionStorage.setItem(
        `menuqr-branch:${restaurant.slug}`,
        selectedBranchId,
      );
  }, [restaurant.slug, selectedBranchId]);
  const changeViewMode = (mode: "grid" | "list") => {
    setViewMode(mode);
    window.localStorage.setItem("menuqr-menu-view", mode);
  };
  const defaultAddress = customerDefaults?.addresses.find((item) => item.isDefault) ?? customerDefaults?.addresses[0];
  const [deliveryAddress, setDeliveryAddress] = useState(defaultAddress?.address ?? customerDefaults?.address ?? "");
  const [deliveryCoordinates, setDeliveryCoordinates] = useState<{ lat: number | null; lng: number | null }>({ lat: defaultAddress?.latitude ?? null, lng: defaultAddress?.longitude ?? null });
  const [locationOpen, setLocationOpen] = useState(false);
  const [addressManuallyEdited, setAddressManuallyEdited] = useState(Boolean(defaultAddress?.address ?? customerDefaults?.address));
  const [locationMessage, setLocationMessage] = useState("");
  const [addressDetails, setAddressDetails] = useState({
    street: "",
    district: "",
    city: "",
    governorate: "",
    country: "",
    postalCode: "",
  });
  const categories = [...new Set(products.map((product) => product.category))];
  const visible = products.filter(
    (product) =>
      (category === "__all" || product.category === category) &&
      product.name.toLowerCase().includes(query.toLowerCase()),
  );
  const count = Object.values(cart).reduce((sum, value) => sum + value, 0);
  const total = useMemo(
    () =>
      products.reduce((sum, product) => {
        const extrasTotal = product.extras
          .filter((extra) => selectedExtras[product.id]?.includes(extra.id))
          .reduce((extraSum, extra) => extraSum + extra.price, 0);
        return sum + (cart[product.id] || 0) * Math.max(0, product.price + extrasTotal);
      }, 0),
    [cart, products, selectedExtras],
  );
  const pricing = useMemo(
    () => calculateOrderPricing(total, fulfillmentType, restaurant.pricing),
    [fulfillmentType, restaurant.pricing, total],
  );
  const promotionItems = useMemo(
    () =>
      products
        .filter((product) => cart[product.id])
        .map((product) => ({
          productId: product.id,
          quantity: cart[product.id],
          extraTotal: product.extras
            .filter((extra) => selectedExtras[product.id]?.includes(extra.id))
            .reduce((sum, extra) => sum + extra.price, 0),
        })),
    [cart, products, selectedExtras],
  );
  const calculatePromotionPricing = useCallback(
    async (couponCode?: string) => {
      if (demo || promotionItems.length === 0) {
        setPromotionPricing(null);
        setAppliedPromotions([]);
        return;
      }
      const response = await fetch("/api/promotions/calculate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurantSlug: restaurant.slug,
          branchId: selectedBranchId || undefined,
          fulfillmentType,
          couponCode: couponCode || undefined,
          items: promotionItems,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.couponError) {
        setPromotionPricing(null);
        setAppliedPromotions([]);
        if (couponCode) {
          const key = result?.couponError as
            | "COUPON_NOT_FOUND"
            | "COUPON_INACTIVE"
            | "COUPON_EXPIRED"
            | "COUPON_USAGE_LIMIT"
            | "COUPON_CUSTOMER_LIMIT"
            | "COUPON_NOT_ELIGIBLE";
          setCouponMessage(
            key && promotionText.has(key)
              ? promotionText(key)
              : promotionText("invalid"),
          );
        }
        return;
      }
      setPromotionPricing(result.pricing);
      setAppliedPromotions(result.appliedPromotions || []);
      if (couponCode) {
        setAppliedCoupon(couponCode.trim().toUpperCase());
        setCouponMessage(promotionText("applied"));
      }
    },
    [demo, fulfillmentType, promotionItems, promotionText, restaurant.slug, selectedBranchId],
  );
  useEffect(() => {
    const timer = window.setTimeout(
      () => void calculatePromotionPricing(appliedCoupon),
      350,
    );
    return () => window.clearTimeout(timer);
  }, [appliedCoupon, calculatePromotionPricing]);
  const displayPricing = promotionPricing || pricing;
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: restaurant.currency,
    }).format(value);
  const update = (id: string, amount: number) => {
    if (!orderingEnabled || !products.find((product) => product.id === id)?.available) return;
    setCart((current) => ({
      ...current,
      [id]: Math.max(0, (current[id] || 0) + amount),
    }));
  };
  const toggleOption = (
    product: MenuProduct,
    group: MenuProduct["optionGroups"][number],
    optionId: string,
    checked: boolean,
  ) => {
    setSelectedExtras((current) => {
      const selected = current[product.id] ?? [];
      const groupIds = new Set(group.options.map((option) => option.id));
      const outsideGroup = selected.filter((id) => !groupIds.has(id));
      const selectedInGroup = selected.filter((id) => groupIds.has(id));

      if (!checked) {
        return {
          ...current,
          [product.id]: selected.filter((id) => id !== optionId),
        };
      }

      const nextInGroup =
        group.max === 1
          ? [optionId]
          : [...selectedInGroup.filter((id) => id !== optionId), optionId].slice(
              0,
              group.max,
            );

      return {
        ...current,
        [product.id]: [...outsideGroup, ...nextInGroup],
      };
    });
  };
  async function checkout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    for (const product of products.filter((item)=>cart[item.id])) {
      for (const group of product.optionGroups) {
        const count=group.options.filter((option)=>selectedExtras[product.id]?.includes(option.id)).length;
        if(count<group.min||count>group.max){setError(validationText("selectionRange",{min:group.min,max:group.max,group:group.name}));setLoading(false);return;}
      }
    }
    const orderItems = products
      .filter((product) => cart[product.id])
      .map((product) => ({
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: cart[product.id],
        extras: product.extras.filter((extra) =>
          selectedExtras[product.id]?.includes(extra.id),
        ),
      }));
    if (demo) {
      const lines = orderItems.map((item) => {
        const selected = item.extras.length
          ? ` (${item.extras.map((extra) => extra.name).join(", ")})`
          : "";
        return `• ${item.quantity} × ${item.name}${selected}`;
      });
      setDemoPreview(
        `${demoText("previewTitle")}\n${restaurant.name}\n\n${lines.join("\n")}\n\n${t("total")}: ${money(pricing.total)}\n\n${demoText("notSent")}`,
      );
      setLoading(false);
      return;
    }
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: restaurant.slug,
        branchId: selectedBranchId || undefined,
        customerName: form.get("name"),
        customerPhone: form.get("phone"),
        deliveryAddress: form.get("address") || undefined,
        deliveryLatitude: form.get("deliveryLatitude") || undefined,
        deliveryLongitude: form.get("deliveryLongitude") || undefined,
        street: form.get("street") || undefined,
        district: form.get("district") || undefined,
        city: form.get("city") || undefined,
        governorate: form.get("governorate") || undefined,
        country: form.get("country") || undefined,
        postalCode: form.get("postalCode") || undefined,
        buildingName: form.get("buildingName") || undefined,
        floor: form.get("floor") || undefined,
        apartment: form.get("apartment") || undefined,
        landmark: form.get("landmark") || undefined,
        deliveryNotes: form.get("deliveryNotes") || undefined,
        fulfillmentType:form.get("fulfillmentType"),
        notes: form.get("notes") || undefined,
        createAccount,
        email: createAccount ? form.get("email") : undefined,
        password: createAccount ? form.get("password") : undefined,
        turnstileToken,
        couponCode: appliedCoupon || undefined,
        items: orderItems,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      const code = body.error?.code;
      setError(
        code?.startsWith("COUPON_")
          ? promotionText.has(code)
            ? promotionText(code)
            : promotionText("invalid")
          : code === "INVALID_ORDER"
          ? t("invalidOrder")
          : code === "BRANCH_REQUIRED"
            ? branchText("branchRequired")
          : code === "TURNSTILE_FAILED"
            ? t("verificationFailed")
            : typeof body.error === "string"
          ? body.error
          : (code ?? common("noData")),
      );
      setLoading(false);
      return;
    }
    window.location.href = body.trackingUrl;
  }
  return (
    <>
      {products.length ? (
        <>
          <div className="menu-tools">
            <div className="menu-search">
              <Search />
              <input
                aria-label={t("search")}
                placeholder={t("search")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="menu-cats">
              <button
                className={category === "__all" ? "active" : ""}
                onClick={() => setCategory("__all")}
              >
                {common("all")}
              </button>
              {categories.map((value) => (
                <button
                  className={value === category ? "active" : ""}
                  onClick={() => setCategory(value)}
                  key={value}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="menu-view-toggle" aria-label={t("viewOrder")}>
              <button type="button" className={viewMode === "grid" ? "active" : ""} onClick={() => changeViewMode("grid")} aria-label={checkoutText("gridView")}><LayoutGrid /></button>
              <button type="button" className={viewMode === "list" ? "active" : ""} onClick={() => changeViewMode("list")} aria-label={checkoutText("listView")}><List /></button>
            </div>
          </div>
          <div className={`product-grid mobile-${viewMode}`}>
            {visible.map((product) => (
              <article className="product-card" key={product.id}>
                {demo && (
                  <button
                    type="button"
                    className={`demo-favorite ${favorites.includes(product.id) ? "saved" : ""}`}
                    onClick={() =>
                      setFavorites((current) =>
                        current.includes(product.id)
                          ? current.filter((id) => id !== product.id)
                          : [...current, product.id],
                      )
                    }
                    aria-label={demoText("favorite")}
                  >
                    <Heart />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedProduct(product)}
                  className="product-detail-link"
                  aria-label={product.name}
                >
                  <div className="product-photo">
                    {product.image && (
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        sizes="(max-width: 540px) 100vw, (max-width: 800px) 50vw, 33vw"
                      />
                    )}
                    {product.featured && <span>{t("featured")}</span>}
                    {product.promotionLabel && <span className="sale-badge">{product.promotionLabel}</span>}
                    {!product.available && <span className="unavailable-badge">{productText("temporary")}</span>}
                  </div>
                </button>
                <div className="product-info" dir={locale === "ar" ? "rtl" : "ltr"}>
                  <div>
                    <button type="button" className="product-name-button" onClick={() => setSelectedProduct(product)}>
                      <h3>{product.name}</h3>
                    </button>
                    <p>{product.description}</p>
                    <strong className={product.discountedPrice != null ? "sale-price" : undefined}>
                      {product.discountedPrice != null && <del>{money(product.price)}</del>}
                      {money(product.discountedPrice ?? product.price)}
                    </strong>
                  </div>
                  {cart[product.id] ? (
                    <div className="qty">
                      <button onClick={() => update(product.id, -1)}>
                        <Minus />
                      </button>
                      <b>{cart[product.id]}</b>
                      <button onClick={() => update(product.id, 1)}>
                        <Plus />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="add"
                      onClick={() => update(product.id, 1)}
                      disabled={!product.available}
                      aria-label={t("add", { product: product.name })}
                    >
                      <Plus />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {selectedProduct && (
            <div className="product-sheet-overlay" role="presentation" onMouseDown={() => setSelectedProduct(null)}>
              <section className="product-sheet" role="dialog" aria-modal="true" aria-label={selectedProduct.name} onMouseDown={(event) => event.stopPropagation()}>
                <button type="button" className="close" aria-label={common("close")} onClick={() => setSelectedProduct(null)}><X /></button>
                <div className="product-sheet-image">
                  {selectedProduct.image && <Image src={selectedProduct.image} alt={selectedProduct.name} fill sizes="(max-width: 768px) 100vw, 520px" />}
                  {selectedProduct.featured && <span>{t("featured")}</span>}
                </div>
                <div className="product-sheet-copy">
                  <h2>{selectedProduct.name}</h2>
                  <p>{selectedProduct.description}</p>
                  <strong className={selectedProduct.discountedPrice != null ? "sale-price" : undefined}>{selectedProduct.discountedPrice != null && <del>{money(selectedProduct.price)}</del>}{money(selectedProduct.discountedPrice ?? selectedProduct.price)}</strong>
                  {[...selectedProduct.optionGroups.map((group) => ({...group, standalone:false})), ...(selectedProduct.extras.filter((extra) => !selectedProduct.optionGroups.some((group) => group.options.some((option) => option.id === extra.id))).length ? [{id:"extras",name:productDetailsText("extras"),required:false,min:0,max:999,options:selectedProduct.extras.filter((extra) => !selectedProduct.optionGroups.some((group) => group.options.some((option) => option.id === extra.id))),standalone:true}] : [])].map((group) => (
                    <fieldset key={group.id}>
                      <legend>{group.name}<small>{group.required ? optionText("required") : optionText("optional")}</small></legend>
                      {group.options.map((option) => {
                        const checked = selectedExtras[selectedProduct.id]?.includes(option.id) ?? false;
                        return <label key={option.id}><input type={group.required && group.max === 1 ? "radio" : "checkbox"} checked={checked} onChange={(event) => toggleOption(selectedProduct, group, option.id, event.target.checked)} /><span>{option.name}</span><small>{option.price ? `+ ${money(option.price)}` : optionText("free")}</small></label>;
                      })}
                    </fieldset>
                  ))}
                </div>
                <div className="product-sheet-action">
                  <div className="qty">
                    <button type="button" aria-label="Decrease" onClick={() => update(selectedProduct.id, -1)}><Minus /></button>
                    <b>{cart[selectedProduct.id] ?? 0}</b>
                    <button type="button" aria-label="Increase" onClick={() => update(selectedProduct.id, 1)}><Plus /></button>
                  </div>
                  <button type="button" className="button primary" disabled={!selectedProduct.available} onClick={() => { if (!cart[selectedProduct.id]) update(selectedProduct.id, 1); setSelectedProduct(null); }}>
                    <ShoppingBag />{productDetailsText("orderNow")}
                  </button>
                </div>
              </section>
            </div>
          )}
        </>
      ) : (
        <p>{t("empty")}</p>
      )}
      {count > 0 && (
        <button className="cart-bar" onClick={() => setOpen(true)}>
          <span>
            <ShoppingBag />
            {t("cart", { count })}
          </span>
          <b>
            {t("viewOrder")} · {money(displayPricing.total)}
          </b>
        </button>
      )}
      {open && (
        <div className="cart-overlay">
          <div className="cart-sheet">
            <button className="close" onClick={() => setOpen(false)}>
              <X />
            </button>
            <h2>{t("yourOrder")}</h2>
            <p>{t("checkoutHelp")}</p>
            <div className="checkout-step-progress"><i style={{width:`${((checkoutStep+1)/3)*100}%`}}/><span>{checkoutStep+1} / 3</span></div>
            <div className={`checkout-step-panel ${checkoutStep === 0 ? "is-active" : ""}`}>
            <div className="cart-lines">
              {products
                .filter((product) => cart[product.id])
                .map((product) => (
                  <div key={product.id} className="cart-product-line">
                    <span>
                      {cart[product.id]} × {product.name}
                    </span>
                    <b>{money(Math.max(0,product.price + product.extras.filter((extra) => selectedExtras[product.id]?.includes(extra.id)).reduce((sum, extra) => sum + extra.price, 0)) * cart[product.id])}</b>
                    {product.optionGroups.map((group) => (
                      <fieldset className="customer-option-group" key={group.id}>
                        <legend>
                          <span>{group.name}</span>
                          <small>
                            {group.required
                              ? optionText("required")
                              : optionText("optional")}
                            {" · "}
                            {optionText("selectionLimit", {
                              min: group.min,
                              max: group.max,
                            })}
                          </small>
                        </legend>
                        {group.options.map((option) => {
                          const selected =
                            selectedExtras[product.id]?.includes(option.id) ??
                            false;
                          const selectedCount = group.options.filter((item) =>
                            selectedExtras[product.id]?.includes(item.id),
                          ).length;
                          const atLimit =
                            !selected &&
                            group.max > 1 &&
                            selectedCount >= group.max;

                          return (
                            <label key={option.id}>
                              <input
                                type={
                                  group.required && group.max === 1
                                    ? "radio"
                                    : "checkbox"
                                }
                                name={`option-${product.id}-${group.id}`}
                                checked={selected}
                                disabled={atLimit}
                                onChange={(event) =>
                                  toggleOption(
                                    product,
                                    group,
                                    option.id,
                                    event.target.checked,
                                  )
                                }
                              />
                              <span>{option.name}</span>
                              <small>
                                {option.price === 0
                                  ? optionText("free")
                                  : `${option.price > 0 ? "+" : "−"} ${money(Math.abs(option.price))}`}
                              </small>
                            </label>
                          );
                        })}
                      </fieldset>
                    ))}
                    {product.extras.filter(
                      (extra) =>
                        !product.optionGroups.some((group) =>
                          group.options.some(
                            (option) => option.id === extra.id,
                          ),
                        ),
                    ).length > 0 && (
                      <fieldset>
                        <legend>{demoText("extras")}</legend>
                        {product.extras
                          .filter(
                            (extra) =>
                              !product.optionGroups.some((group) =>
                                group.options.some(
                                  (option) => option.id === extra.id,
                                ),
                              ),
                          )
                          .map((extra) => (
                            <label key={extra.id}>
                              <input
                                type="checkbox"
                                checked={
                                  selectedExtras[product.id]?.includes(
                                    extra.id,
                                  ) ?? false
                                }
                                onChange={(event) =>
                                  setSelectedExtras((current) => ({
                                    ...current,
                                    [product.id]: event.target.checked
                                      ? [
                                          ...(current[product.id] ?? []),
                                          extra.id,
                                        ]
                                      : (current[product.id] ?? []).filter(
                                          (id) => id !== extra.id,
                                        ),
                                  }))
                                }
                              />
                              <span>{extra.name}</span>
                              <small>
                                {extra.price === 0
                                  ? optionText("free")
                                  : `${extra.price > 0 ? "+" : "−"} ${money(Math.abs(extra.price))}`}
                              </small>
                            </label>
                          ))}
                      </fieldset>
                    )}
                  </div>
                ))}
            </div>
            <div className="cart-total">
              <span>{t("total")}</span>
              <strong>{money(displayPricing.total)}</strong>
            </div>
            <div className="checkout-step-actions"><button type="button" className="button primary" onClick={() => setCheckoutStep(1)}>{common("next")}</button></div>
            </div>
            <form onSubmit={checkout}>
              <div className={`checkout-step-panel ${checkoutStep === 1 ? "is-active" : ""}`}>
              {branches.length > 1 && !branchLocked && (
                <label className="branch-choice">
                  <span>{branchText("chooseBranch")} *</span>
                  <small>{branchText("chooseBranchHelp")}</small>
                  <select
                    required
                    value={selectedBranchId}
                    onChange={(event) => setSelectedBranchId(event.target.value)}
                  >
                    <option value="">{branchText("chooseBranch")}</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                        {compactBranchLocation(branch.address, branch.city)
                          ? ` — ${compactBranchLocation(branch.address, branch.city)}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selectedBranch && (branches.length === 1 || branchLocked) && (
                <p className="selected-branch-line">
                  <b>{branchText("selectedBranch")}:</b> {selectedBranch.name}
                </p>
              )}
              <div className="fulfillment-choice">{restaurant.fulfillment.delivery&&<label><input type="radio" name="fulfillmentType" value="DELIVERY" checked={fulfillmentType==="DELIVERY"} onChange={()=>setFulfillmentType("DELIVERY")}/>{demoText("delivery")}</label>}{restaurant.fulfillment.pickup&&<label><input type="radio" name="fulfillmentType" value="PICKUP" checked={fulfillmentType==="PICKUP"} onChange={()=>setFulfillmentType("PICKUP")}/>{demoText("pickup")}</label>}{restaurant.fulfillment.dineIn&&<label><input type="radio" name="fulfillmentType" value="DINE_IN" checked={fulfillmentType==="DINE_IN"} onChange={()=>setFulfillmentType("DINE_IN")}/>{demoText("dineIn")}</label>}</div>
              <input name="name" required placeholder={t("name")} defaultValue={customerDefaults?.name} />
              <input name="phone" required placeholder={t("phone")} defaultValue={customerDefaults?.phone} />
              {fulfillmentType === "DELIVERY" && customerDefaults?.addresses.length ? <select className="saved-address-select" defaultValue={defaultAddress?.id ?? ""} onChange={(event) => { const saved = customerDefaults.addresses.find((item) => item.id === event.target.value); if (saved) { setDeliveryAddress(saved.address); setDeliveryCoordinates({ lat: saved.latitude, lng: saved.longitude }); setAddressManuallyEdited(true); } else { setDeliveryAddress(""); setDeliveryCoordinates({ lat: null, lng: null }); setAddressManuallyEdited(false); } }}><option value="">{mapsText("manualAddress")}</option>{customerDefaults.addresses.map((item) => <option value={item.id} key={item.id}>{item.title} — {item.address}</option>)}</select> : null}
              {fulfillmentType === "DELIVERY" && <>
                <label className="checkout-address-field">
                  <span>{checkoutText("deliveryAddress")} *</span>
                  <textarea name="address" required minLength={5} maxLength={300} rows={3} placeholder={checkoutText("addressExample")} value={deliveryAddress} onChange={(event) => { setDeliveryAddress(event.target.value); setAddressManuallyEdited(true); }} />
                </label>
                <input type="hidden" name="deliveryLatitude" value={deliveryCoordinates.lat ?? ""} />
                <input type="hidden" name="deliveryLongitude" value={deliveryCoordinates.lng ?? ""} />
                {Object.entries(addressDetails).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
                <section className="checkout-location-trigger">
                  <button type="button" className="button ghost" onClick={() => { setLocationMessage(""); setLocationOpen(true); }}><MapPin />{checkoutText("chooseOnMap")}</button>
                  <small>{checkoutText("mapOptionalHelp")}</small>
                  {deliveryCoordinates.lat != null && deliveryCoordinates.lng != null && <b>{checkoutText("locationSelected")}</b>}
                  {locationMessage && <p className="location-help">{locationMessage}</p>}
                </section>
                <details className="checkout-address-details" open>
                  <summary><span>{checkoutText("additionalDetails")}</span><ChevronDown /></summary>
                  <div>
                    <input name="buildingName" required maxLength={120} placeholder={`${checkoutText("buildingName")} *`} />
                    <input name="floor" required maxLength={30} inputMode="numeric" placeholder={`${checkoutText("floor")} *`} />
                    <input name="apartment" required maxLength={30} inputMode="numeric" placeholder={`${checkoutText("apartment")} *`} />
                    <input name="landmark" required maxLength={200} placeholder={`${checkoutText("landmark")} *`} />
                    <textarea name="deliveryNotes" required maxLength={500} rows={3} placeholder={`${checkoutText("deliveryNotes")} *`} />
                  </div>
                </details>
                {locationOpen && <div className="location-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLocationOpen(false); }}>
                  <section className="location-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-map-title">
                    <header><h2 id="checkout-map-title"><MapPin />{checkoutText("chooseOnMap")}</h2><button type="button" className="location-modal-close" onClick={() => setLocationOpen(false)} aria-label={common("close")}><X /></button></header>
                    <LocationField
                      initialLat={deliveryCoordinates.lat}
                      initialLng={deliveryCoordinates.lng}
                      autoLocate={deliveryCoordinates.lat == null}
                      onChange={(lat, lng) => setDeliveryCoordinates({ lat, lng })}
                      onAddressResolved={(address, details) => {
                        setAddressDetails({
                          street: details.street ?? "",
                          district: details.district ?? "",
                          city: details.city ?? "",
                          governorate: details.governorate ?? "",
                          country: details.country ?? "",
                          postalCode: details.postalCode ?? "",
                        });
                        if (!addressManuallyEdited) setDeliveryAddress(address);
                        setLocationMessage("");
                      }}
                      onAddressError={() => setLocationMessage(checkoutText("addressLookupFailed"))}
                    />
                    <div className="location-modal-actions"><button type="button" className="button primary" onClick={() => setLocationOpen(false)}>{checkoutText("confirmLocation")}</button></div>
                  </section>
                </div>}
              </>}
              <textarea name="notes" placeholder={t("notes")} />
              <div className="checkout-step-actions"><button type="button" className="button ghost" onClick={() => setCheckoutStep(0)}>{common("previous")}</button><button type="button" className="button primary" onClick={(event) => { if (event.currentTarget.form?.reportValidity()) setCheckoutStep(2); }}>{common("next")}</button></div>
              </div>
              <div className={`checkout-step-panel ${checkoutStep === 2 ? "is-active" : ""}`}>
              <section className="checkout-summary" aria-labelledby="checkout-summary-title">
                <header>
                  <div><small>{restaurant.name}</small><h3 id="checkout-summary-title">{checkoutText("paymentSummary")}</h3></div>
                  {restaurant.phone && <a href={`tel:${restaurant.phone}`}>{restaurant.phone}</a>}
                </header>
                {selectedBranch && <div><span>{branchText("selectedBranch")}</span><b>{selectedBranch.name}</b></div>}
                <div><span>{checkoutText("subtotal")}</span><b>{money(displayPricing.subtotal)}</b></div>
                {fulfillmentType === "DELIVERY" && <div><span>{checkoutText("deliveryFee")}</span><b>{money(displayPricing.deliveryFee)}</b></div>}
                {displayPricing.discountAmount > 0 && <div className="discount-line"><span>{checkoutText("discount")}</span><b>− {money(displayPricing.discountAmount)}</b></div>}
                {displayPricing.serviceFee > 0 && <div><span>{checkoutText("serviceFee")}</span><b>{money(displayPricing.serviceFee)}</b></div>}
                {displayPricing.taxAmount > 0 && <div><span>{checkoutText("tax")}</span><b>{money(displayPricing.taxAmount)}</b></div>}
                <div><span>{checkoutText("paymentMethod")}</span><b>{checkoutText("cash")}</b></div>
                <div><span>{checkoutText("estimatedTime")}</span><b>{restaurant.estimatedMinutes} {checkoutText("minutes")}</b></div>
                {fulfillmentType === "DELIVERY" && deliveryAddress && <p><strong>{checkoutText("deliveryAddress")}</strong>{deliveryAddress}</p>}
                <section className="checkout-coupon">
                  <label>{promotionText("coupon")}<div><input value={couponInput} onChange={(event) => setCouponInput(event.target.value.toUpperCase())} placeholder={promotionText("placeholder")} disabled={Boolean(appliedCoupon)} /><button type="button" className="button ghost" onClick={() => appliedCoupon ? (setAppliedCoupon(""), setCouponInput(""), setCouponMessage("")) : void calculatePromotionPricing(couponInput)}>{appliedCoupon ? promotionText("remove") : promotionText("apply")}</button></div></label>
                  {couponMessage && <small className={appliedCoupon ? "coupon-success" : "form-error"}>{couponMessage}</small>}
                  {appliedPromotions.length > 0 && <div className="applied-promotions"><b>{promotionText("appliedPromotions")}</b>{appliedPromotions.map((promotion) => <span key={promotion.id}>{locale === "ar" && promotion.nameAr ? promotion.nameAr : promotion.name} · −{money(promotion.discountAmount)}</span>)}</div>}
                </section>
                <footer><span>{checkoutText("grandTotal")}</span><strong>{money(displayPricing.total)}</strong></footer>
              </section>
              {!demo && !customerDefaults && <section className="checkout-account-choice">
                <h3>{accountT("saveInfoTitle")}</h3>
                <p>{accountT("saveInfoText")}</p>
                <ul>
                  {["favoritesRestaurants", "favoritesMeals", "orderHistory", "savedAddresses", "fasterCheckout"].map((key) => <li key={key}><span>✓</span>{accountT(`accountBenefits.${key}`)}</li>)}
                </ul>
                <div className="checkout-account-actions">
                  <button type="button" className={`button ${createAccount ? "primary" : "ghost"}`} onClick={() => setCreateAccount(true)}>{accountT("createAccount")}</button>
                  <button type="button" className={`button ${!createAccount ? "primary" : "ghost"}`} onClick={() => setCreateAccount(false)}>{accountT("continueGuest")}</button>
                </div>
                {createAccount && <div className="checkout-account-fields">
                  <input name="email" type="email" required placeholder={accountT("accountEmail")} autoComplete="email" />
                  <input name="password" type="password" required minLength={8} pattern="(?=.*[A-Z])(?=.*[0-9]).{8,}" placeholder={accountT("accountPassword")} autoComplete="new-password" />
                  <small>{accountT("accountPasswordHint")}</small>
                </div>}
              </section>}
              {!demo && <TurnstileWidget onToken={setTurnstileToken} />}
              {error && <p className="form-error">{error}</p>}
              <div className="checkout-step-actions"><button type="button" className="button ghost" onClick={() => setCheckoutStep(1)}>{common("previous")}</button></div>
              <button className="button primary large" disabled={loading}>
                {loading ? common("noData") : demo ? demoText("generatePreview") : checkoutText("confirmOrder")}
              </button>
              {demoPreview && (
                <section className="demo-order-preview">
                  <h3>{demoText("previewTitle")}</h3>
                  <pre>{demoPreview}</pre>
                </section>
              )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
