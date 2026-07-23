import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/customer";

export const dynamic = "force-dynamic";
export default async function CustomerHome() {
  const { session, customerId } = await requireCustomer();
  const [t, locale, orders, favoriteRestaurants, favoriteProducts] = await Promise.all([
    getTranslations("customerAccount"), getLocale(),
    prisma.order.findMany({ where: { customerUserId: session.user.id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, accessToken: true, orderNumber: true, total: true, status: true, createdAt: true, restaurant: { select: { name: true, nameAr: true, currency: true } }, items: { select: { productId: true, quantity: true } } } }),
    prisma.customerFavoriteRestaurant.findMany({ where: { customerId }, take: 4, orderBy: { createdAt: "desc" }, select: { restaurant: { select: { id: true, name: true, nameAr: true, slug: true, logoUrl: true } } } }),
    prisma.customerFavoriteProduct.findMany({ where: { customerId }, take: 4, orderBy: { createdAt: "desc" }, select: { product: { select: { id: true, name: true, nameAr: true, price: true, restaurant: { select: { slug: true, currency: true } } } } } }),
  ]);
  const localName=(name:string,nameAr:string|null)=>locale==="ar"&&nameAr?nameAr:name;
  return <section className="customer-main"><header><h1>{t("home.title",{name:session.user.name||"MenuQR"})}</h1><p>{t("home.subtitle")}</p></header><div className="customer-summary-grid"><article><h2>{t("home.recentOrders")}</h2>{orders.length?orders.map(order=><Link className="customer-row" href={`/order/${order.accessToken}`} key={order.id}><span><b>{localName(order.restaurant.name,order.restaurant.nameAr)}</b><small>{order.orderNumber}</small></span><strong>{new Intl.NumberFormat(locale,{style:"currency",currency:order.restaurant.currency}).format(Number(order.total))}</strong></Link>):<p>{t("common.noData")}</p>}</article><article><h2>{t("home.favoriteRestaurants")}</h2>{favoriteRestaurants.length?favoriteRestaurants.map(({restaurant})=><Link className="customer-row" href={`/menu/${restaurant.slug}`} key={restaurant.id}><b>{localName(restaurant.name,restaurant.nameAr)}</b></Link>):<p>{t("common.noData")}</p>}</article><article><h2>{t("home.favoriteProducts")}</h2>{favoriteProducts.length?favoriteProducts.map(({product})=><Link className="customer-row" href={`/menu/${product.restaurant.slug}/product/${product.id}`} key={product.id}><b>{localName(product.name,product.nameAr)}</b></Link>):<p>{t("common.noData")}</p>}</article></div></section>;
}
