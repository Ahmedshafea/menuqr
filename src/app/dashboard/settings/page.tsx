import { revalidatePath, revalidateTag } from "next/cache";
import { Save } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { uploadRestaurantImage } from "@/lib/supabase/storage";
import { RestaurantQr } from "@/components/restaurant-qr";
import { redirect } from "next/navigation";
import { NotificationPreferences } from "@/components/notification-preferences";
import LocationField from "@/components/map/LocationField";
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const { restaurantId } = await requireTenant();
  const [t, common, qr, polish, mvp, notifications, fulfillment, pricing, maps, restaurant] = await Promise.all([
    getTranslations("settings"),
    getTranslations("common"),
    getTranslations("qr"),
    getTranslations("launchPolish.settings"),
    getTranslations("mvpPolish.qr"),
    getTranslations("mvpPolish.notifications"),
    getTranslations("restaurantWorkflow.settings"),
    getTranslations("pricingSettings"),
    getTranslations("maps"),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      include: {
        settings: true,
        branches: { include: { workingHours: true }, take: 1 },
      },
    }),
  ]);
  const branch = restaurant.branches[0];
  const menuUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/menu/${restaurant.slug}`;
  async function save(form: FormData) {
    "use server";
    const { restaurantId } = await requireTenant();
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
          mapUrl: null,
          latitude: coordinate("latitude", -90, 90),
          longitude: coordinate("longitude", -180, 180),
          facebookUrl: String(form.get("facebookUrl") || "").trim() || null,
          instagramUrl: String(form.get("instagramUrl") || "").trim() || null,
          currency: String(form.get("currency") || "EGP"),
          locale: String(form.get("locale") || "ar"),
          ...(uploadedLogo ? { logoUrl: uploadedLogo.url } : {}),
          ...(uploadedCover ? { coverUrl: uploadedCover.url } : {}),
        },
      });
      let currentBranch = await tx.branch.findFirst({
        where: { restaurantId },
        select: { id: true },
      });
      if (currentBranch)
        await tx.branch.update({
          where: { id: currentBranch.id },
          data: { name, address },
        });
      else
        currentBranch = await tx.branch.create({
          data: { restaurantId, name, address },
          select: { id: true },
        });
      for (let day = 0; day < 7; day++) {
        const isClosed = form.get(`closed-${day}`) === "on";
        const opensAt = String(form.get(`open-${day}`) || "") || null;
        const closesAt = String(form.get(`close-${day}`) || "") || null;
        await tx.workingHour.upsert({
          where: {
            branchId_dayOfWeek: { branchId: currentBranch.id, dayOfWeek: day },
          },
          create: {
            branchId: currentBranch.id,
            dayOfWeek: day,
            isClosed,
            opensAt,
            closesAt,
          },
          update: { isClosed, opensAt, closesAt },
        });
      }
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
          discountValue: adjustmentValue("discountValue", "discountType"),
          discountType: adjustmentType("discountType"),
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
          discountValue: adjustmentValue("discountValue", "discountType"),
          discountType: adjustmentType("discountType"),
        },
      });
    });
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/profile");
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
      <form action={save} className="dash-card settings-form">
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
        <div className="settings-section">
          <h2>{t("profile")}</h2>
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
            <label className="full">
              {t("address")}
              <input
                name="address"
                defaultValue={restaurant.address ?? branch?.address ?? ""}
              />
            </label>
            <div className="full restaurant-location-field">
              <h3>{maps("title")}</h3>
              <LocationField
                initialLat={restaurant.latitude == null ? null : Number(restaurant.latitude)}
                initialLng={restaurant.longitude == null ? null : Number(restaurant.longitude)}
                latitudeName="latitude"
                longitudeName="longitude"
                autoLocate
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
        </div>
        <div className="settings-section">
          <h2>{t("ordering")}</h2>
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
        </div>
        <div className="settings-section">
          <h2>{pricing("title")}</h2>
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
              {
                key: "discountValue",
                typeKey: "discountType",
                label: pricing("discount"),
                value: Number(restaurant.settings?.discountValue ?? 0),
                type: restaurant.settings?.discountType ?? "FIXED",
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
        </div>
        <div className="settings-section">
          <h2>{t("hours")}</h2>
          <div className="working-hours-grid">
            {Array.from({ length: 7 }, (_, day) => {
              const hours = branch?.workingHours.find(
                (item) => item.dayOfWeek === day,
              );
              return (
                <div className="working-day" key={day}>
                  <strong>{t(`days.${day}`)}</strong>
                  <label>
                    {t("openTime")}
                    <input
                      name={`open-${day}`}
                      type="time"
                      defaultValue={hours?.opensAt ?? "09:00"}
                    />
                  </label>
                  <label>
                    {t("closeTime")}
                    <input
                      name={`close-${day}`}
                      type="time"
                      defaultValue={hours?.closesAt ?? "23:00"}
                    />
                  </label>
                  <label className="check-label">
                    <input
                      name={`closed-${day}`}
                      type="checkbox"
                      defaultChecked={hours?.isClosed ?? false}
                    />
                    {t("closed")}
                  </label>
                </div>
              );
            })}
          </div>
        </div>
        <div className="settings-section">
          <h2>{notifications("title")}</h2>
          <NotificationPreferences labels={{browser:notifications("browser"),sound:notifications("sound"),help:notifications("preferencesHelp")}} />
        </div>
        <div className="settings-section qr-settings-section" id="restaurant-qr">
          <h2>{qr("sectionTitle")}</h2>
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
        </div>
        <button className="button primary">
          <Save />
          {common("save")}
        </button>
      </form>
    </section>
  );
}
