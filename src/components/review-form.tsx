"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const fields = [
  "overall",
  "foodQuality",
  "deliverySpeed",
  "packaging",
  "staffBehavior",
] as const;

export function ReviewForm({
  action,
  allowImages,
}: {
  action: (formData: FormData) => void | Promise<void>;
  allowImages: boolean;
}) {
  const t = useTranslations("reviews.form");
  const [scores, setScores] = useState<Record<(typeof fields)[number], number>>(
    Object.fromEntries(fields.map((name) => [name, 5])) as Record<
      (typeof fields)[number],
      number
    >,
  );

  return (
    <form action={action} className="public-review-form">
      {fields.map((name) => (
        <fieldset key={name}>
          <legend>{t(name)}</legend>
          <div
            className="star-input"
            role="radiogroup"
            aria-label={t(name)}
          >
            {[1, 2, 3, 4, 5].map((score) => (
              <label key={score}>
                <input
                  type="radio"
                  name={name}
                  value={score}
                  checked={scores[name] === score}
                  onChange={() =>
                    setScores((current) => ({ ...current, [name]: score }))
                  }
                  aria-label={t("scoreLabel", {
                    field: t(name),
                    score,
                  })}
                  required
                />
                <span aria-hidden="true">★</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <label>
        {t("name")}
        <input name="customerName" maxLength={80} autoComplete="name" />
      </label>
      <label>
        {t("comment")}
        <textarea name="comment" maxLength={1000} rows={5} />
      </label>
      {allowImages && (
        <label>
          {t("images")}
          <input
            name="images"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
          />
        </label>
      )}
      <button className="button primary large" type="submit">
        {t("submit")}
      </button>
    </form>
  );
}
