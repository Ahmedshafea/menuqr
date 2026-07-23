import { Heart } from "lucide-react";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function customerProfileId() {
  const session = await auth();
  if (!session?.user.roles.includes("CUSTOMER")) return null;
  return (await prisma.customerProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } }))?.id ?? null;
}

export async function FavoriteRestaurantButton({restaurantId,slug}:{restaurantId:string;slug:string}) {
  const customerId=await customerProfileId(); if(!customerId)return null;
  const [t,favorite]=await Promise.all([getTranslations("customerAccount.favorites"),prisma.customerFavoriteRestaurant.findUnique({where:{customerId_restaurantId:{customerId,restaurantId}},select:{restaurantId:true}})]);
  async function toggle(){"use server";const currentCustomerId=await customerProfileId();if(!currentCustomerId)return;const key={customerId_restaurantId:{customerId:currentCustomerId,restaurantId}};const exists=await prisma.customerFavoriteRestaurant.findUnique({where:key,select:{restaurantId:true}});if(exists)await prisma.customerFavoriteRestaurant.delete({where:key});else await prisma.customerFavoriteRestaurant.create({data:{customerId:currentCustomerId,restaurantId}});revalidatePath(`/menu/${slug}`);revalidatePath("/account/favorites/restaurants");}
  return <form action={toggle}><button className={`favorite-button ${favorite?"saved":""}`} aria-label={favorite?t("remove"):t("saveRestaurant")}><Heart />{favorite?t("saved"):t("saveRestaurant")}</button></form>;
}

export async function FavoriteProductButton({productId,slug}:{productId:string;slug:string}) {
  const customerId=await customerProfileId(); if(!customerId)return null;
  const [t,favorite]=await Promise.all([getTranslations("customerAccount.favorites"),prisma.customerFavoriteProduct.findUnique({where:{customerId_productId:{customerId,productId}},select:{productId:true}})]);
  async function toggle(){"use server";const currentCustomerId=await customerProfileId();if(!currentCustomerId)return;const key={customerId_productId:{customerId:currentCustomerId,productId}};const exists=await prisma.customerFavoriteProduct.findUnique({where:key,select:{productId:true}});if(exists)await prisma.customerFavoriteProduct.delete({where:key});else await prisma.customerFavoriteProduct.create({data:{customerId:currentCustomerId,productId}});revalidatePath(`/menu/${slug}/product/${productId}`);revalidatePath("/account/favorites/products");}
  return <form action={toggle}><button className={`favorite-button ${favorite?"saved":""}`} aria-label={favorite?t("remove"):t("saveProduct")}><Heart />{favorite?t("saved"):t("saveProduct")}</button></form>;
}
