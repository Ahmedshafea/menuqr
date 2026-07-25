"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Heart, Minus, Plus, Search, ShoppingBag, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Image from "next/image";
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
  orderingEnabled = true,
  initialCart = {},
  initialSelectedExtras = {},
  initialOpen = false,
  customerDefaults,
  demo = false,
}: {
  restaurant: { name: string; slug: string; currency: string; fulfillment:{delivery:boolean;pickup:boolean;dineIn:boolean} };
  products: MenuProduct[];
  orderingEnabled?: boolean;
  initialCart?: Record<string, number>;
  initialSelectedExtras?: Record<string, string[]>;
  initialOpen?: boolean;
  customerDefaults?: { name: string; phone: string; address: string };
  demo?: boolean;
}) {
  const t = useTranslations("publicMenu");
  const accountT = useTranslations("customerAccount.checkout");
  const common = useTranslations("common");
  const productText = useTranslations("mvpPolish.products");
  const demoText = useTranslations("demo");
  const validationText = useTranslations("restaurantWorkflow.validation");
  const optionText = useTranslations("productFormOptions");
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
  const [fulfillmentType, setFulfillmentType] = useState(defaultFulfillment);
  const [createAccount, setCreateAccount] = useState(false);
  const [selectedExtras, setSelectedExtras] =
    useState<Record<string, string[]>>(initialSelectedExtras);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [demoPreview, setDemoPreview] = useState("");
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
        `${demoText("previewTitle")}\n${restaurant.name}\n\n${lines.join("\n")}\n\n${t("total")}: ${money(total)}\n\n${demoText("notSent")}`,
      );
      setLoading(false);
      return;
    }
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: restaurant.slug,
        customerName: form.get("name"),
        customerPhone: form.get("phone"),
        deliveryAddress: form.get("address") || undefined,
        fulfillmentType:form.get("fulfillmentType"),
        notes: form.get("notes") || undefined,
        createAccount,
        email: createAccount ? form.get("email") : undefined,
        password: createAccount ? form.get("password") : undefined,
        turnstileToken,
        items: orderItems,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      const code = body.error?.code;
      setError(
        code === "INVALID_ORDER"
          ? t("invalidOrder")
          : code === "TURNSTILE_FAILED"
            ? t("verificationFailed")
            : typeof body.error === "string"
          ? body.error
          : (code ?? common("noData")),
      );
      setLoading(false);
      return;
    }
    window.location.href = body.whatsappUrl;
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
          </div>
          <div className="product-grid">
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
                <Link
                  href={`/menu/${restaurant.slug}/product/${product.id}`}
                  className="product-detail-link"
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
                    {!product.available && <span className="unavailable-badge">{productText("temporary")}</span>}
                  </div>
                </Link>
                <div className="product-info">
                  <div>
                    <Link
                      href={`/menu/${restaurant.slug}/product/${product.id}`}
                    >
                      <h3>{product.name}</h3>
                    </Link>
                    <p>{product.description}</p>
                    <strong>{money(product.price)}</strong>
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
            {t("viewOrder")} · {money(total)}
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
              <strong>{money(total)}</strong>
            </div>
            <form onSubmit={checkout}>
              <div className="fulfillment-choice">{restaurant.fulfillment.delivery&&<label><input type="radio" name="fulfillmentType" value="DELIVERY" checked={fulfillmentType==="DELIVERY"} onChange={()=>setFulfillmentType("DELIVERY")}/>{demoText("delivery")}</label>}{restaurant.fulfillment.pickup&&<label><input type="radio" name="fulfillmentType" value="PICKUP" checked={fulfillmentType==="PICKUP"} onChange={()=>setFulfillmentType("PICKUP")}/>{demoText("pickup")}</label>}{restaurant.fulfillment.dineIn&&<label><input type="radio" name="fulfillmentType" value="DINE_IN" checked={fulfillmentType==="DINE_IN"} onChange={()=>setFulfillmentType("DINE_IN")}/>{demoText("dineIn")}</label>}</div>
              <input name="name" required placeholder={t("name")} defaultValue={customerDefaults?.name} />
              <input name="phone" required placeholder={t("phone")} defaultValue={customerDefaults?.phone} />
              <input name="address" required={fulfillmentType==="DELIVERY"} placeholder={fulfillmentType==="DELIVERY"?t("addressRequired"):t("address")} defaultValue={customerDefaults?.address} />
              <textarea name="notes" placeholder={t("notes")} />
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
              <button className="button primary large" disabled={loading}>
                {loading ? common("noData") : demo ? demoText("generatePreview") : t("whatsapp")}
              </button>
              {demoPreview && (
                <section className="demo-order-preview">
                  <h3>{demoText("previewTitle")}</h3>
                  <pre>{demoPreview}</pre>
                </section>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
