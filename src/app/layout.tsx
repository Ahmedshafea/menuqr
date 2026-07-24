import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import "./i18n.css";
import "./profile.css";
import "./product-detail.css";
import "./hours.css";
import "./order-tracking.css";
import { getLocale, getMessages } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { ToastProvider } from "@/components/toast-provider";
const inter = Inter({ subsets:["latin"], variable:"--font-sans" });
const playfair = Playfair_Display({ subsets:["latin"], variable:"--font-display" });
export async function generateMetadata():Promise<Metadata>{const {getTranslations}=await import("next-intl/server");const t=await getTranslations("metadata");return{metadataBase:new URL(process.env.NEXT_PUBLIC_APP_URL||"http://localhost:3000"),title:{default:t("title"),template:"%s · MenuQR"},description:t("description"),openGraph:{title:t("title"),description:t("description"),type:"website"},twitter:{card:"summary_large_image"}}}
export default async function RootLayout({children}:{children:React.ReactNode}) { const locale=await getLocale();const messages=await getMessages();return <html lang={locale} dir={locale==="ar"?"rtl":"ltr"}><body className={`${inter.variable} ${playfair.variable}`}><NextIntlClientProvider messages={messages}>{children}<ToastProvider /></NextIntlClientProvider></body></html> }
