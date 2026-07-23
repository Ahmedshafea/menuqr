import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const locales = ["ar", "en"] as const;
export type AppLocale = (typeof locales)[number];

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get("MENUQR_LOCALE")?.value;
  const browserLocale = (await headers())
    .get("accept-language")
    ?.toLowerCase()
    .startsWith("en")
    ? "en"
    : "ar";
  const locale: AppLocale =
    cookieLocale === "en" || cookieLocale === "ar"
      ? cookieLocale
      : browserLocale;
  const [messages, productTools, orderTracking, qr, landingV2, customerAccount] = await Promise.all([
    import(`../../messages/${locale}.json`),
    import(`../../messages/product-tools.${locale}.json`),
    import(`../../messages/order-tracking.${locale}.json`),
    import(`../../messages/qr.${locale}.json`),
    import(`../../messages/landing-v2.${locale}.json`),
    import(`../../messages/customer-account.${locale}.json`),
  ]);
  return {
    locale,
    messages: {
      ...messages.default,
      productTools: productTools.default,
      orderTracking: orderTracking.default,
      qr: qr.default,
      landingV2: landingV2.default,
      customerAccount: customerAccount.default,
    },
    timeZone: "Africa/Cairo",
  };
});
