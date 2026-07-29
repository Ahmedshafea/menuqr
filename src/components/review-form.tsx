"use client";

import { useState } from "react";

const fields = [
  ["overall", "Overall experience", "التجربة العامة"],
  ["foodQuality", "Food quality", "جودة الطعام"],
  ["deliverySpeed", "Delivery speed", "سرعة التوصيل"],
  ["packaging", "Packaging", "التغليف"],
  ["staffBehavior", "Staff behavior", "تعامل الموظفين"],
] as const;

export function ReviewForm({
  action,
  arabic,
  allowImages,
}: {
  action: (formData: FormData) => void | Promise<void>;
  arabic: boolean;
  allowImages: boolean;
}) {
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(fields.map(([name]) => [name, 5])),
  );
  return (
    <form action={action} className="public-review-form">
      {fields.map(([name, en, ar]) => (
        <fieldset key={name}>
          <legend>{arabic ? ar : en}</legend>
          <div className="star-input">
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
                  required
                />
                <span aria-hidden="true">★</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <label>
        {arabic ? "الاسم (اختياري)" : "Name (optional)"}
        <input name="customerName" maxLength={80} />
      </label>
      <label>
        {arabic ? "تعليقك (اختياري)" : "Your comment (optional)"}
        <textarea name="comment" maxLength={1000} rows={5} />
      </label>
      {allowImages && (
        <label>
          {arabic ? "صور التجربة (حتى 3 صور)" : "Experience images (up to 3)"}
          <input
            name="images"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
          />
        </label>
      )}
      <button className="button primary large">
        {arabic ? "إرسال التقييم" : "Submit review"}
      </button>
    </form>
  );
}
