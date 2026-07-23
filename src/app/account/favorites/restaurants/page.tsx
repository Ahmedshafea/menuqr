import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/customer";

export const dynamic="force-dynamic";
export default async function FavoriteRestaurants(){const {customerId}=await requireCustomer();const [t,locale,items]=await Promise.all([getTranslations("customerAccount.favorites"),getLocale(),prisma.customerFavoriteRestaurant.findMany({where:{customerId},orderBy:{createdAt:"desc"},select:{restaurant:{select:{id:true,name:true,nameAr:true,slug:true,description:true,descriptionAr:true}}}})]);async function remove(form:FormData){"use server";const {customerId}=await requireCustomer();await prisma.customerFavoriteRestaurant.deleteMany({where:{customerId,restaurantId:String(form.get("id"))}});revalidatePath("/account/favorites/restaurants");}return <section className="customer-main"><header><h1>{t("restaurantsTitle")}</h1></header><div className="customer-card-grid">{items.length?items.map(({restaurant})=><article key={restaurant.id}><h2>{locale==="ar"&&restaurant.nameAr?restaurant.nameAr:restaurant.name}</h2><p>{locale==="ar"&&restaurant.descriptionAr?restaurant.descriptionAr:restaurant.description}</p><div><Link className="button primary" href={`/menu/${restaurant.slug}`}>{t("openMenu")}</Link><form action={remove}><input type="hidden" name="id" value={restaurant.id}/><button className="button ghost">{t("remove")}</button></form></div></article>):<p>{t("emptyRestaurants")}</p>}</div></section>}
