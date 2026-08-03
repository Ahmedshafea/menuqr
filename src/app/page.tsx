import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChefHat,
  Clock3,
  ImageIcon,
  MessageCircle,
  PencilLine,
  Printer,
  QrCode,
  Smartphone,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { RestaurantQr } from "@/components/restaurant-qr";
import { auth } from "@/auth";
import { demoRestaurantCards } from "@/lib/demo-restaurants";
import {
  getPlanCatalog,
  ensureRestaurantSubscription,
} from "@/lib/subscription-plans";
import { getHomepageSections } from "@/lib/platform-config";

export const revalidate = 300;

const foodCategories = [
  { key: "burger", emoji: "🍔", image: "photo-1568901346375-23c9450c58cd" },
  { key: "pizza", emoji: "🍕", image: "photo-1574071318508-1cdbab80d002" },
  { key: "cafe", emoji: "☕", image: "photo-1495474472287-4d71bcdd2085" },
  { key: "desserts", emoji: "🍰", image: "photo-1578985545062-69928b1d9587" },
  { key: "chicken", emoji: "🍗", image: "photo-1626645738196-c2a7c87a8f58" },
  { key: "grills", emoji: "🥩", image: "photo-1529692236671-f1f6cf9683ba" },
  { key: "oriental", emoji: "🥘", image: "photo-1547592180-85f173990554" },
  { key: "sushi", emoji: "🍣", image: "photo-1579871494447-9811cf80d66c" },
] as const;

const featureIcons = [ImageIcon, MessageCircle, PencilLine, Smartphone];
const benefitIcons = [Printer, Clock3, MessageCircle, QrCode, Sparkles, Smartphone];

function unsplash(id: string, width = 800) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=78`;
}

export default async function Home() {
  const [t, nav, accountNav, demoText, plansText, locale, session, catalog, homepageSections] = await Promise.all([
    getTranslations("landingV2"),
    getTranslations("nav"),
    getTranslations("launchPolish.navigation"),
    getTranslations("demo"),
    getTranslations("subscriptionPlans"),
    getLocale(),
    auth(),
    getPlanCatalog(),
    getHomepageSections(),
  ]);
  const currentSubscription = session?.user.restaurantId
    ? await ensureRestaurantSubscription(session.user.restaurantId)
    : null;
  const demoUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/menu/demo-bistro`;
  const content = (key: string) => {
    const section = homepageSections.find((item) => item.key === key);
    const localized = section?.content && typeof section.content === "object" && !Array.isArray(section.content)
      ? (section.content as Record<string, unknown>)[locale]
      : null;
    return { enabled: section?.enabled ?? true, value: localized && typeof localized === "object" && !Array.isArray(localized) ? localized as Record<string, unknown> : {} };
  };
  const hero = content("hero");
  const announcement = content("announcement");
  const cmsText = (section: { value: Record<string, unknown> }, key: string, fallback: string) => typeof section.value[key] === "string" ? section.value[key] as string : fallback;

  return (
    <main className="landing-page">
      {announcement.enabled && <div className="launch-banner">🎉 {cmsText(announcement, "text", t("banner"))}</div>}

      <nav className="landing-nav wrap" aria-label={t("navigationLabel")}>
        <Link href="/" className="brand">
          <span><QrCode /></span>MenuQR
        </Link>
        <div className="navlinks">
          <Link href="#how">{t("how.title")}</Link>
          <Link href="#features">{nav("features")}</Link>
          <Link href="#showcase">{t("showcase.title")}</Link>
          <Link href="#pricing">{nav("pricing")}</Link>
        </div>
        <div className="nav-actions">
          <LanguageSwitcher compact />
          {session ? <Link href={session.user.restaurantId ? "/dashboard" : "/account"} className="button primary">{session.user.restaurantId ? accountNav("restaurantDashboard") : accountNav("myAccount")}</Link> : <><Link href="/login" className="button ghost">{nav("signIn")}</Link><Link href="/register" className="button primary">{nav("start")}</Link></>}
        </div>
      </nav>

      {hero.enabled && <section className="landing-hero wrap">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={15} />{cmsText(hero, "eyebrow", t("hero.eyebrow"))}</div>
          <h1>{cmsText(hero, "title", t("hero.title"))}</h1>
          <p>{cmsText(hero, "description", t("hero.description"))}</p>
          <ul className="hero-benefits">
            {["free", "bilingual", "mobile"].map((key) => (
              <li key={key}><Check />{t(`hero.bullets.${key}`)}</li>
            ))}
          </ul>
          <div className="hero-actions">
            <Link href="/register" className="button primary large">
              {t("hero.primary")}<ArrowRight />
            </Link>
            <Link href="/menu/demo-bistro" className="button secondary large">
              {t("hero.secondary")}
            </Link>
          </div>
        </div>

        <div className="hero-visual" aria-label={t("hero.previewLabel")}>
          <div className="landing-phone">
            <div className="phone-speaker" />
            <div className="phone-restaurant-cover">
              <Image src={unsplash("photo-1515003197210-e0cd71810b5f", 700)} alt="" fill priority sizes="280px" />
              <span>{t("hero.open")}</span>
              <div><small>{t("hero.welcome")}</small><strong>{t("hero.demoRestaurant")}</strong></div>
            </div>
            <div className="phone-categories"><b>{t("hero.popular")}</b><span>{t("hero.grills")}</span><span>{t("hero.drinks")}</span></div>
            <div className="phone-dish">
              <Image src={unsplash("photo-1565299624946-b28f40a0ae38", 240)} alt="" width={74} height={74} sizes="74px" />
              <div><strong>{t("hero.dishOne")}</strong><small>{t("hero.dishDescription")}</small><b>{t("hero.priceOne")}</b></div>
            </div>
            <div className="phone-dish">
              <Image src={unsplash("photo-1568901346375-23c9450c58cd", 240)} alt="" width={74} height={74} sizes="74px" />
              <div><strong>{t("hero.dishTwo")}</strong><small>{t("hero.dishDescription")}</small><b>{t("hero.priceTwo")}</b></div>
            </div>
          </div>
          <div className="hero-qr">
            <p>{t("hero.scan")}</p>
            <RestaurantQr menuUrl={demoUrl} slug="demo-bistro" label={t("hero.scanToOpen")} />
          </div>
        </div>
      </section>}

      <section className="landing-section category-section wrap">
        <div className="landing-heading centered"><span>{t("categories.label")}</span><h2>{t("categories.title")}</h2><p>{t("categories.description")}</p></div>
        <div className="food-category-grid">
          {foodCategories.map((category) => (
            <article className="food-category-card" key={category.key}>
              <Image src={unsplash(category.image, 500)} alt="" fill sizes="(max-width: 600px) 50vw, 25vw" />
              <div><span>{category.emoji}</span><h3>{t(`categories.items.${category.key}`)}</h3></div>
            </article>
          ))}
        </div>
      </section>

      <section id="showcase" className="landing-section live-demo-section wrap">
        <div className="landing-heading centered">
          <span>{demoText("sectionLabel")}</span>
          <h2>{demoText("sectionTitle")}</h2>
          <p>{demoText("sectionDescription")}</p>
        </div>
        <div className="restaurant-grid demo-restaurant-grid">
          {demoRestaurantCards.map((restaurant) => (
            <article className="restaurant-card" key={restaurant.slug}>
              <Link href={`/menu/${restaurant.slug}`}>
                <div className="restaurant-cover">
                  <Image
                    src={restaurant.image}
                    alt={locale === "ar" ? restaurant.nameAr : restaurant.name}
                    fill
                    sizes="(max-width: 700px) 100vw, 25vw"
                  />
                  <span className="demo-card-badge">{demoText("badge")}</span>
                </div>
                <div className="restaurant-card-copy">
                  <small>{locale === "ar" ? restaurant.cuisineAr : restaurant.cuisine}</small>
                  <h3>{locale === "ar" ? restaurant.nameAr : restaurant.name}</h3>
                  <p>{locale === "ar" ? restaurant.descriptionAr : restaurant.description}</p>
                  <em>{demoText("products", { count: restaurant.productCount })}</em>
                  <strong>{demoText("view")}<ArrowRight /></strong>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section id="how" className="landing-section how-section">
        <div className="wrap">
          <div className="landing-heading centered"><span>{t("how.label")}</span><h2>{t("how.title")}</h2></div>
          <div className="steps-grid">
            {[{ icon: ChefHat, key: "account" }, { icon: UtensilsCrossed, key: "menu" }, { icon: QrCode, key: "qr" }].map((step, index) => (
              <article className="step-card" key={step.key}>
                <span className="step-number">{index + 1}</span><step.icon />
                <h3>{t(`how.steps.${step.key}.title`)}</h3><p>{t(`how.steps.${step.key}.text`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="landing-section wrap">
        <div className="landing-heading"><span>{t("features.label")}</span><h2>{t("features.title")}</h2><p>{t("features.description")}</p></div>
        <div className="marketing-feature-grid">
          {["menu", "orders", "updates", "mobile"].map((key, index) => {
            const Icon = featureIcons[index];
            return <article key={key}><div className="feature-icon"><Icon /></div><h3>{t(`features.items.${key}.title`)}</h3><p>{t(`features.items.${key}.text`)}</p></article>;
          })}
        </div>
      </section>

      <section className="landing-section why-section wrap">
        <div className="why-copy"><span>{t("why.label")}</span><h2>{t("why.title")}</h2><p>{t("why.description")}</p><Link href="/register" className="button primary large">{t("hero.primary")}<ArrowRight /></Link></div>
        <div className="benefits-grid">
          {["printing", "updates", "orders", "qr", "design", "mobile"].map((key, index) => {
            const Icon = benefitIcons[index];
            return <article key={key}><Icon /><span>{t(`why.items.${key}`)}</span></article>;
          })}
        </div>
      </section>

      <section id="pricing" className="landing-section pricing-section">
        <div className="wrap pricing-wrap">
          <div className="landing-heading centered"><span>{plansText("label")}</span><h2>{plansText("title")}</h2><p>{plansText("description")}</p></div>
          {catalog.launchPromotion && (
            <aside className="launch-plan-notice">
              <Sparkles />
              <b>{plansText("trialBadge", { days: catalog.launchPromotion.trialDays })}</b>
              <span>{plansText("launchEnds", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(catalog.launchPromotion.endsAt) })}</span>
            </aside>
          )}
          <div className="pricing-plan-grid">
            {catalog.plans.map((plan) => {
              const isCurrent = currentSubscription?.planId === plan.id;
              const launchApplies = catalog.launchPromotion?.affectedPlanId === plan.id;
              const planName = locale === "ar" && plan.nameAr ? plan.nameAr : plan.name;
              const description = locale === "ar" && plan.descriptionAr ? plan.descriptionAr : plan.description;
              return (
                <article className={`pricing-plan-card${plan.isRecommended ? " recommended" : ""}`} key={plan.id}>
                  <header>
                    <div>
                      <small>{plan.code}</small>
                      <h3>{planName}</h3>
                    </div>
                    {isCurrent ? <span className="current-plan-badge">{plansText("current")}</span> : plan.isRecommended ? <span>{plansText("recommended")}</span> : null}
                  </header>
                  {launchApplies && <b className="launch-offer-badge">{plansText("launchBadge")}</b>}
                  <p>{description}</p>
                  <div className="plan-price">
                    {Number(plan.price) === 0 ? <strong>{plansText("free")}</strong> : <><strong>{new Intl.NumberFormat(locale).format(Number(plan.price))}</strong><span>{plansText("monthly")}</span></>}
                  </div>
                  <ul>
                    {plan.features.map(({ feature, value }) => (
                      <li key={feature.id}><Check />{value != null ? plansText("limitValue", { count: value < 0 ? plansText("unlimited") : value, feature: locale === "ar" && feature.nameAr ? feature.nameAr : feature.name }) : locale === "ar" && feature.nameAr ? feature.nameAr : feature.name}</li>
                    ))}
                  </ul>
                  <Link href={session?.user.restaurantId ? `/dashboard/subscription?plan=${plan.code}` : session ? "/account" : "/register"} className={`button ${plan.isRecommended ? "primary" : "ghost"} large`}>
                    {isCurrent ? plansText("current") : plansText("choose", { plan: planName })}<ArrowRight />
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="final-cta wrap">
        <div className="cta-glow" />
        <QrCode className="cta-qr-icon" />
        <div><span>{t("final.label")}</span><h2>{t("final.title")}</h2><p>{t("final.text")}</p></div>
        <Link href="/register" className="button light large">{t("final.button")}<ArrowRight /></Link>
      </section>

      <footer className="landing-footer wrap">
        <Link href="/" className="brand"><span><QrCode /></span>MenuQR</Link>
        <p>{t("footer")}</p>
        <small>© {new Date().getFullYear()} MenuQR</small>
      </footer>
    </main>
  );
}
