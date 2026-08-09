import { revalidatePath, revalidateTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireOwner, requireTenant } from "@/lib/tenant";
import { uploadRestaurantImage } from "@/lib/supabase/storage";
import { RestaurantQr } from "@/components/restaurant-qr";
import { redirect } from "next/navigation";
import { NotificationPreferences } from "@/components/notification-preferences";
import { RestaurantLocationFields } from "@/components/restaurant-location-fields";
import { DashboardFormModal } from "@/components/dashboard-form-modal";
import { FormWizard } from "@/components/form-wizard";
import { hasFeature } from "@/lib/subscription-plans";
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const { restaurantId } = await requireTenant();
  const [t, common, qr, polish, mvp, notifications, fulfillment, pricing, restaurant, reviewsAvailable] = await Promise.all([
    getTranslations("settings"),
    getTranslations("common"),
    getTranslations("qr"),
    getTranslations("launchPolish.settings"),
    getTranslations("mvpPolish.qr"),
    getTranslations("mvpPolish.notifications"),
    getTranslations("restaurantWorkflow.settings"),
    getTranslations("pricingSettings"),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      include: {
        settings: true,
      },
    }),
    hasFeature(restaurantId, "REVIEWS"),
  ]);
  const menuUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/menu/${restaurant.slug}`;
  async function save(form: FormData) {
    "use server";
    const { restaurantId } = await requireOwner();
    const reviewsFeatureEnabled = await hasFeature(restaurantId, "REVIEWS");
    const logo = form.get("logo");
    const cover = form.get("cover");
    const [uploadedLogo, uploadedCover] = await Promise.all([
      logo instanceof File && logo.size
        ? uploadRestaurantImage({
            bucket: "restaurant-logos",
            restaurantId,
            file: logo,
          })
        : null,
      cover instanceof File && cover.size
        ? uploadRestaurantImage({
            bucket: "restaurant-covers",
            restaurantId,
            file: cover,
          })
        : null,
    ]);
    const name = String(form.get("name") || "").trim();
    const address = String(form.get("address") || "").trim();
    const structuredAddress = {
      governorate: String(form.get("governorate") || "").trim(),
      city: String(form.get("city") || "").trim(),
      district: String(form.get("district") || "").trim(),
      area: String(form.get("area") || "").trim(),
      street: String(form.get("street") || "").trim(),
      postalCode: String(form.get("postalCode") || "").trim(),
    };
    const coordinate = (name: string, min: number, max: number) => {
      const raw = String(form.get(name) || "").trim();
      if (!raw) return null;
      const value = Number(raw);
      return Number.isFinite(value) && value >= min && value <= max ? value : null;
    };
    const adjustmentType = (name: string) =>
      form.get(name) === "PERCENTAGE" ? "PERCENTAGE" : "FIXED";
    const adjustmentValue = (name: string, typeName: string) => {
      const value = Math.max(0, Number(form.get(name)) || 0);
      return adjustmentType(typeName) === "PERCENTAGE"
        ? Math.min(100, value)
        : value;
    };
    const latitude = coordinate("latitude", -90, 90);
    const longitude = coordinate("longitude", -180, 180);
    if (
      !address ||
      !structuredAddress.governorate ||
      !structuredAddress.city ||
      !structuredAddress.district ||
      !structuredAddress.area ||
      !structuredAddress.street ||
      latitude == null ||
      longitude == null
    )
      throw new Error("INVALID_RESTAURANT_LOCATION");
    await prisma.$transaction(async (tx) => {
      await tx.restaurant.update({
        where: { id: restaurantId },
        data: {
          name,
          nameAr: String(form.get("nameAr") || "").trim() || null,
          description: String(form.get("description") || "").trim() || null,
          descriptionAr: String(form.get("descriptionAr") || "").trim() || null,
          phone: String(form.get("phone") || "").trim() || null,
          whatsapp: String(form.get("whatsapp") || "").replace(/\D/g, ""),
          address: address || null,
          governorate: structuredAddress.governorate,
          city: structuredAddress.city,
          district: structuredAddress.district,
          area: structuredAddress.area,
          street: structuredAddress.street,
          postalCode: structuredAddress.postalCode || null,
          mapUrl: null,
          latitude,
          longitude,
          facebookUrl: String(form.get("facebookUrl") || "").trim() || null,
          instagramUrl: String(form.get("instagramUrl") || "").trim() || null,
          currency: String(form.get("currency") || "EGP"),
          locale: String(form.get("locale") || "ar"),
          ...(uploadedLogo ? { logoUrl: uploadedLogo.url } : {}),
          ...(uploadedCover ? { coverUrl: uploadedCover.url } : {}),
        },
      });
      const currentBranch = await tx.branch.findFirst({
        where: { restaurantId },
        select: { id: true },
      });
      if (!currentBranch)
        await tx.branch.create({
          data: {
            restaurantId,
            name,
            slug: "main",
            address,
            governorate: structuredAddress.governorate,
            state: structuredAddress.governorate,
            city: structuredAddress.city,
            district: structuredAddress.district,
            area: structuredAddress.area,
            street: structuredAddress.street,
            postalCode: structuredAddress.postalCode || null,
            latitude,
            longitude,
            workingHours: {
              create: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                dayOfWeek,
                opensAt: "00:00",
                closesAt: "23:59",
                isClosed: false,
              })),
            },
          },
        });
      await tx.setting.upsert({
        where: { restaurantId },
        create: {
          restaurantId,
          allowOrdering: form.get("allowOrdering") === "on",
          allowOrdersOutsideHours: form.get("allowOrdersOutsideHours") === "on",
          estimatedOrderMinutes: Math.max(
            1,
            Number(form.get("estimatedOrderMinutes")) || 30,
          ),
          offersDelivery: form.get("offersDelivery") === "on",
          offersPickup: form.get("offersPickup") === "on",
          offersDineIn: form.get("offersDineIn") === "on",
          deliveryFee: adjustmentValue("deliveryFee", "deliveryFeeType"),
          deliveryFeeType: adjustmentType("deliveryFeeType"),
          serviceFee: adjustmentValue("serviceFee", "serviceFeeType"),
          serviceFeeType: adjustmentType("serviceFeeType"),
          taxRate: adjustmentValue("taxRate", "taxType"),
          taxType: adjustmentType("taxType"),
          reviewsEnabled: reviewsFeatureEnabled && form.get("reviewsEnabled") === "on",
          reviewImagesEnabled: reviewsFeatureEnabled && form.get("reviewImagesEnabled") === "on",
          anonymousReviewsEnabled: reviewsFeatureEnabled && form.get("anonymousReviewsEnabled") === "on",
          requireCompletedOrderForReview: reviewsFeatureEnabled && form.get("requireCompletedOrderForReview") === "on",
          autoPublishReviews: reviewsFeatureEnabled && form.get("autoPublishReviews") === "on",
        },
        update: {
          allowOrdering: form.get("allowOrdering") === "on",
          allowOrdersOutsideHours: form.get("allowOrdersOutsideHours") === "on",
          estimatedOrderMinutes: Math.max(
            1,
            Number(form.get("estimatedOrderMinutes")) || 30,
          ),
          offersDelivery: form.get("offersDelivery") === "on",
          offersPickup: form.get("offersPickup") === "on",
          offersDineIn: form.get("offersDineIn") === "on",
          deliveryFee: adjustmentValue("deliveryFee", "deliveryFeeType"),
          deliveryFeeType: adjustmentType("deliveryFeeType"),
          serviceFee: adjustmentValue("serviceFee", "serviceFeeType"),
          serviceFeeType: adjustmentType("serviceFeeType"),
          taxRate: adjustmentValue("taxRate", "taxType"),
          taxType: adjustmentType("taxType"),
          reviewsEnabled: reviewsFeatureEnabled && form.get("reviewsEnabled") === "on",
          reviewImagesEnabled: reviewsFeatureEnabled && form.get("reviewImagesEnabled") === "on",
          anonymousReviewsEnabled: reviewsFeatureEnabled && form.get("anonymousReviewsEnabled") === "on",
          requireCompletedOrderForReview: reviewsFeatureEnabled && form.get("requireCompletedOrderForReview") === "on",
          autoPublishReviews: reviewsFeatureEnabled && form.get("autoPublishReviews") === "on",
        },
      });
    });
    revalidatePath("/dashboard/settings");
    revalidatePath("/menu", "layout");
    revalidateTag("public-menu");
    redirect("/dashboard/settings?toast=settingsUpdated");
  }
  return (
    <section className="dash-main">
      <header>
        <div>
          <small>{t("profile")}</small>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
      </header>
      <DashboardFormModal title={t("title")} closeHref="/dashboard">
      <form action={save} className="dash-card settings-form">
        <FormWizard
          stepTitles={[t("profile"), t("ordering"), pricing("title"), notifications("title"), ...(reviewsAvailable ? [restaurant.locale === "ar" ? "إعدادات التقييمات" : "Review settings"] : []), qr("sectionTitle")]}
          previousLabel={common("previous")}
          nextLabel={common("next")}
          finishLabel={common("save")}
        >
        <div className="restaurant-media">
          {restaurant.coverUrl && (
            <div
              className="restaurant-cover-preview"
              style={{ backgroundImage: `url(${restaurant.coverUrl})` }}
            />
          )}
          {restaurant.logoUrl && (
            <div
              className="restaurant-logo-preview"
              style={{ backgroundImage: `url(${restaurant.logoUrl})` }}
            />
          )}
        </div>
        <section className="settings-section">
          <div className="settings-grid">
            <label>
              {t("logo")}
              <input
                name="logo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
              />
            </label>
            <label>
              {t("cover")}
              <input
                name="cover"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
              />
            </label>
            <label>
              {t("nameEn")}
              <input name="name" required defaultValue={restaurant.name} />
            </label>
            <label>
              {t("nameAr")}
              <input
                name="nameAr"
                dir="rtl"
                defaultValue={restaurant.nameAr ?? ""}
              />
            </label>
            <label className="full">
              {t("descriptionEn")}
              <textarea
                name="description"
                defaultValue={restaurant.description ?? ""}
              />
            </label>
            <label className="full">
              {t("descriptionAr")}
              <textarea
                name="descriptionAr"
                dir="rtl"
                defaultValue={restaurant.descriptionAr ?? ""}
              />
            </label>
            <label>
              {t("phone")}
              <input name="phone" defaultValue={restaurant.phone ?? ""} />
            </label>
            <label>
              {t("whatsapp")}
              <input
                name="whatsapp"
                required
                defaultValue={restaurant.whatsapp}
              />
            </label>
            <div className="full">
              <RestaurantLocationFields
                initial={{
                  address: restaurant.address ?? "",
                  governorate: restaurant.governorate ?? "",
                  city: restaurant.city ?? "",
                  district: restaurant.district ?? "",
                  area: restaurant.area ?? "",
                  street: restaurant.street ?? "",
                  postalCode: restaurant.postalCode ?? "",
                }}
                latitude={restaurant.latitude == null ? null : Number(restaurant.latitude)}
                longitude={restaurant.longitude == null ? null : Number(restaurant.longitude)}
              />
            </div>
            <label>
              {t("facebook")}
              <input
                name="facebookUrl"
                type="url"
                defaultValue={restaurant.facebookUrl ?? ""}
              />
            </label>
            <label>
              {t("instagram")}
              <input
                name="instagramUrl"
                type="url"
                defaultValue={restaurant.instagramUrl ?? ""}
              />
            </label>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-grid">
            <label className="check-label">
              <input
                name="allowOrdering"
                type="checkbox"
                defaultChecked={restaurant.settings?.allowOrdering ?? true}
              />
              {t("acceptOrders")}
            </label>
            <fieldset className="full fulfillment-settings"><legend>{fulfillment("fulfillment")}</legend><label className="check-label"><input name="offersDelivery" type="checkbox" defaultChecked={restaurant.settings?.offersDelivery??true}/>{fulfillment("delivery")}</label><label className="check-label"><input name="offersPickup" type="checkbox" defaultChecked={restaurant.settings?.offersPickup??true}/>{fulfillment("pickup")}</label><label className="check-label"><input name="offersDineIn" type="checkbox" defaultChecked={restaurant.settings?.offersDineIn??false}/>{fulfillment("dineIn")}</label></fieldset>
            <label className="check-label">
              <input name="allowOrdersOutsideHours" type="checkbox" defaultChecked={restaurant.settings?.allowOrdersOutsideHours ?? false} />
              <span>{polish("outsideHours")}<small>{polish("outsideHoursHelp")}</small></span>
            </label>
            <label>
              {t("estimatedMinutes")}
              <input
                name="estimatedOrderMinutes"
                type="number"
                min="1"
                max="1440"
                defaultValue={restaurant.settings?.estimatedOrderMinutes ?? 30}
              />
            </label>
            <label>
              {t("currency")}
              <select name="currency" defaultValue={restaurant.currency}>
                {["EGP", "USD", "SAR", "AED"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              {t("language")}
              <select name="locale" defaultValue={restaurant.locale}>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
        </section>
        <section className="settings-section">
          <p>{pricing("description")}</p>
          <div className="settings-grid pricing-settings-grid">
            {[
              {
                key: "deliveryFee",
                typeKey: "deliveryFeeType",
                label: pricing("deliveryFee"),
                value: Number(restaurant.settings?.deliveryFee ?? 0),
                type: restaurant.settings?.deliveryFeeType ?? "FIXED",
                help: pricing("deliveryHelp"),
              },
              {
                key: "serviceFee",
                typeKey: "serviceFeeType",
                label: pricing("serviceFee"),
                value: Number(restaurant.settings?.serviceFee ?? 0),
                type: restaurant.settings?.serviceFeeType ?? "FIXED",
                help: pricing("percentageHelp"),
              },
              {
                key: "taxRate",
                typeKey: "taxType",
                label: pricing("tax"),
                value: Number(restaurant.settings?.taxRate ?? 0),
                type: restaurant.settings?.taxType ?? "PERCENTAGE",
                help: pricing("percentageHelp"),
              },
            ].map((item) => (
              <fieldset className="pricing-adjustment" key={item.key}>
                <legend>{item.label}</legend>
                <label>
                  {pricing("value")}
                  <input
                    name={item.key}
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={item.value}
                  />
                </label>
                <label>
                  <span>{pricing("fixed")} / {pricing("percentage")}</span>
                  <select name={item.typeKey} defaultValue={item.type}>
                    <option value="FIXED">{pricing("fixed")}</option>
                    <option value="PERCENTAGE">{pricing("percentage")}</option>
                  </select>
                </label>
                <small>{item.help}</small>
              </fieldset>
            ))}
          </div>
        </section>
        <section className="settings-section">
          <NotificationPreferences labels={{browser:notifications("browser"),sound:notifications("sound"),help:notifications("preferencesHelp")}} />
        </section>
        {reviewsAvailable && <section className="settings-section">
          <div className="settings-check-grid">
            {[
              ["reviewsEnabled", restaurant.locale === "ar" ? "تفعيل التقييمات" : "Enable reviews", restaurant.settings?.reviewsEnabled ?? true],
              ["reviewImagesEnabled", restaurant.locale === "ar" ? "السماح بالصور" : "Allow images", restaurant.settings?.reviewImagesEnabled ?? true],
              ["anonymousReviewsEnabled", restaurant.locale === "ar" ? "السماح بالتقييم المجهول" : "Allow anonymous reviews", restaurant.settings?.anonymousReviewsEnabled ?? true],
              ["requireCompletedOrderForReview", restaurant.locale === "ar" ? "اشتراط طلب مكتمل" : "Require completed order", restaurant.settings?.requireCompletedOrderForReview ?? false],
              ["autoPublishReviews", restaurant.locale === "ar" ? "النشر التلقائي" : "Auto publish", restaurant.settings?.autoPublishReviews ?? false],
            ].map(([name,label,checked])=><label className="check-label" key={String(name)}><input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)}/>{String(label)}</label>)}
          </div>
          <RestaurantQr
            menuUrl={`${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/r/${restaurant.slug}/review`}
            slug={`${restaurant.slug}-review`}
            label={restaurant.locale === "ar" ? "امسح الرمز لإضافة تقييم" : "Scan to leave a review"}
            controls={{png:qr("downloadPng"),svg:qr("downloadSvg"),copy:qr("copyLink"),copied:qr("copied"),printA4:mvp("printA4"),printCards:mvp("printCards")}}
          />
        </section>}
        <section id="restaurant-qr" className="settings-section qr-settings-section">
          <p>{qr("sectionHelp")}</p>
          <RestaurantQr
            menuUrl={menuUrl}
            slug={restaurant.slug}
            label={qr("scan")}
            controls={{
              png: qr("downloadPng"),
              svg: qr("downloadSvg"),
              copy: qr("copyLink"),
              copied: qr("copied"),
              printA4: mvp("printA4"),
              printCards: mvp("printCards"),
            }}
          />
          <small>{mvp("futureTables")}</small>
        </section>
        </FormWizard>
      </form>
      </DashboardFormModal>
    </section>
  );
}
