"use client";

import { useMemo, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";

type OptionGroup = {
  id: string;
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: { id: string; name: string; price: number }[];
};

export function ProductOrderOptions({
  slug,
  productId,
  price,
  currency,
  locale,
  groups,
}: {
  slug: string;
  productId: string;
  price: number;
  currency: string;
  locale: string;
  groups: OptionGroup[];
}) {
  const t = useTranslations("productDetails");
  const optionText = useTranslations("productFormOptions");
  const [selected, setSelected] = useState<string[]>([]);
  const total = useMemo(
    () =>
      price +
      groups
        .flatMap((group) => group.options)
        .filter((option) => selected.includes(option.id))
        .reduce((sum, option) => sum + option.price, 0),
    [groups, price, selected],
  );
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(value);

  const toggle = (group: OptionGroup, optionId: string, checked: boolean) => {
    const groupIds = new Set(group.options.map((option) => option.id));
    setSelected((current) => {
      if (!checked) return current.filter((id) => id !== optionId);
      const outside = current.filter((id) => !groupIds.has(id));
      const inside = current.filter((id) => groupIds.has(id));
      return [
        ...outside,
        ...(group.max === 1
          ? [optionId]
          : [...inside, optionId].slice(0, group.max)),
      ];
    });
  };

  const order = () => {
    for (const group of groups) {
      const count = group.options.filter((option) =>
        selected.includes(option.id),
      ).length;
      if (count < group.min || count > group.max) return;
    }
    const query = new URLSearchParams({
      reorder: `${productId}:1`,
      checkout: "1",
    });
    if (selected.length) query.set("extras", selected.join(","));
    window.location.href = `/menu/${slug}?${query.toString()}`;
  };

  return (
    <div className="product-order-options">
      {groups.map((group) => (
        <fieldset key={group.id}>
          <legend>
            <b>{group.name}</b>
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
            const checked = selected.includes(option.id);
            return (
              <label key={option.id}>
                <input
                  type={
                    group.required && group.max === 1 ? "radio" : "checkbox"
                  }
                  name={`detail-option-${group.id}`}
                  checked={checked}
                  onChange={(event) =>
                    toggle(group, option.id, event.target.checked)
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
      <button type="button" className="button primary large" onClick={order}>
        <ShoppingBag />
        {t("orderNow")}
        <b>{money(total)}</b>
      </button>
    </div>
  );
}
