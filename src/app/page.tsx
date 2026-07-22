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
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { RestaurantQr } from "@/components/restaurant-qr";

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

const restaurants = [
  { key: "burgerHouse", image: "photo-1550547660-d9450f859349", logo: "BH" },
  { key: "pizzaNapoli", image: "photo-1579751626657-72bc17010498", logo: "PN" },
  { key: "coffeeCorner", image: "photo-1445116572660-236099ec97a0", logo: "CC" },
  { key: "sweetCake", image: "photo-1551024506-0bccd828d307", logo: "SC" },
  { key: "chickenGrill", image: "photo-1532550907401-a500c9a57435", logo: "CG" },
  { key: "sushiBox", image: "photo-1579871494447-9811cf80d66c", logo: "SB" },
] as const;

const featureIcons = [ImageIcon, MessageCircle, PencilLine, Smartphone];
const benefitIcons = [Printer, Clock3, MessageCircle, QrCode, Sparkles, Smartphone];

function unsplash(id: string, width = 800) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=78`;
}

export default async function Home() {
  const [t, nav, qr] = await Promise.all([
    getTranslations("landingV2"),
    getTranslations("nav"),
    getTranslations("qr"),
  ]);
  const demoUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/menu/demo-bistro`;

  return (
    <main className="landing-page">
      <div className="launch-banner">🎉 {t("banner")}</div>

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
          <Link href="/login" className="button ghost">{nav("signIn")}</Link>
          <Link href="/register" className="button primary">{nav("start")}</Link>
        </div>
      </nav>

      <section className="landing-hero wrap">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={15} />{t("hero.eyebrow")}</div>
          <h1>{t("hero.title")}</h1>
          <p>{t("hero.description")}</p>
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
            <RestaurantQr menuUrl={demoUrl} slug="demo-bistro" label={qr("scanToOpen")} />
          </div>
        </div>
      </section>

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

      <section id="showcase" className="landing-section showcase-section">
        <div className="wrap">
          <div className="landing-heading centered"><span>{t("showcase.label")}</span><h2>{t("showcase.title")}</h2><p>{t("showcase.description")}</p></div>
          <div className="restaurant-grid">
            {restaurants.map((restaurant) => (
              <article className="restaurant-card" key={restaurant.key}>
                <Link href="/menu/demo-bistro" aria-label={t("showcase.open", { name: t(`showcase.items.${restaurant.key}.name`) })}>
                  <div className="restaurant-cover"><Image src={unsplash(restaurant.image, 700)} alt="" fill sizes="(max-width: 700px) 100vw, 33vw" /></div>
                  <div className="restaurant-logo">{restaurant.logo}</div>
                  <div className="restaurant-card-copy"><small>{t(`showcase.items.${restaurant.key}.type`)}</small><h3>{t(`showcase.items.${restaurant.key}.name`)}</h3><p>{t(`showcase.items.${restaurant.key}.description`)}</p><strong>{t("showcase.view")}<ArrowRight /></strong></div>
                </Link>
              </article>
            ))}
          </div>
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
          <div className="landing-heading"><span>{t("pricing.label")}</span><h2>{t("pricing.title")}</h2><p>{t("pricing.description")}</p></div>
          <article className="free-plan-card">
            <div className="free-plan-head"><div><small>{t("pricing.launch")}</small><h3>{t("pricing.cardTitle")}</h3></div><span>{t("pricing.price")}</span></div>
            <ul>{["menu", "qr", "images", "whatsapp", "languages"].map((key) => <li key={key}><Check />{t(`pricing.items.${key}`)}</li>)}</ul>
            <Link href="/register" className="button primary large">{t("pricing.button")}<ArrowRight /></Link>
          </article>
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
