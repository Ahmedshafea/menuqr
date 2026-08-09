import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { Copy, Gift, MessageCircle, Minus, Phone, Plus, RefreshCw, Store, Trash2, UserRound } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { applicationUrl, publicOrderUrl, whatsappUrl } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { recalculateOrder, requireManagedOrder } from "@/lib/order-management";
import { createRestaurantNotification } from "@/lib/restaurant-notifications";
import {
  CustomerQuickActions,
  OrderPrintActions,
} from "@/components/order-workspace-actions";
import { OrderLocationActions } from "@/components/order-location-actions";
import { AccordionSection } from "@/components/accordion-section";
import { sendOrderStatusNotification, sendReviewRequest } from "@/lib/whatsapp";
import { hasFeature } from "@/lib/subscription-plans";
import { adjustInventory, restoreOrderInventory } from "@/lib/inventory";
import { canTransitionOrder } from "@/lib/order-state";
import type { OrderStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const accountSchema = z.object({
  email: z.email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
});

export default async function OrderTrackingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { token } = await params;
  const { result } = await searchParams;
  const [session, t, flow, deliveryText, reviewText, mapsText, promotionText, branchText, locale, order] = await Promise.all([
    auth(),
    getTranslations("orderTracking"),
    getTranslations("launchPolish.orders"),
    getTranslations("restaurantWorkflow.delivery"),
    getTranslations("restaurantWorkflow.reviews"),
    getTranslations("maps"),
    getTranslations("promotions.checkout"),
    getTranslations("branches"),
    getLocale(),
    prisma.order.findUnique({
      where: { accessToken: token },
      include: {
        restaurant: {
          select: {
            id: true,
            slug: true,
            name: true,
            nameAr: true,
            logoUrl: true,
            whatsapp: true,
            currency: true,
            products: { where: { isAvailable: true }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true, price: true, optionGroups:{select:{group:{select:{options:{select:{option:{select:{id:true,name:true,nameAr:true,priceAdjustment:true,isAvailable:true}}}}}}}} } },
            drivers:{orderBy:{name:"asc"},select:{id:true,name:true,status:true}},
          },
        },
        branch: {
          select: {
            name: true,
            slug: true,
            phone: true,
            address: true,
          },
        },
        items: { select: { id: true, productId:true, productName: true, unitPrice: true, quantity: true, notes: true, isComplimentary: true, product:{select:{images:{orderBy:{sortOrder:"asc"},take:1,select:{url:true}}}}, extras: { select: { id: true, name: true, price: true, extraId:true } },options:{select:{id:true,name:true,price:true,optionId:true}} } },
        driver:{select:{id:true,name:true,phone:true,whatsapp:true,photoUrl:true,vehicleType:true,status:true}},
        review:{select:{id:true,foodQuality:true,deliverySpeed:true,packaging:true,overall:true,comment:true,status:true}},
        promotionOrders:{select:{id:true,promotionName:true,promotionType:true,discountAmount:true,snapshot:true},orderBy:{createdAt:"asc"}},
        messages: {
          orderBy: { createdAt: "asc" },
          select: { id: true, body: true, sender: true, createdAt: true },
        },
        statusHistory: { orderBy: { createdAt: "asc" }, select: { id: true, status: true, createdAt: true } },
        actionLogs: { orderBy: { createdAt: "desc" }, take: 30, select: { id: true, action: true, details: true, createdAt: true, user: { select: { name: true } } } },
      },
    }),
  ]);
  if (!order) notFound();
  const reviewsAvailable = await hasFeature(order.restaurantId, "REVIEWS");
  const isRestaurant = Boolean(
    session?.user.restaurantId === order.restaurantId &&
    session.user.roles.some((role) => ["RESTAURANT_OWNER", "STAFF", "SUPER_ADMIN"].includes(role)),
  );
  const isLinkedCustomer = session?.user.id === order.customerUserId;
  const customerMetrics = isRestaurant
    ? await prisma.order.aggregate({
        where: {
          restaurantId: order.restaurantId,
          ...(order.customerUserId
            ? { customerUserId: order.customerUserId }
            : { customerPhone: order.customerPhone }),
        },
        _count: { _all: true },
        _sum: { total: true },
      })
    : null;
  const restaurantName =
    locale === "ar" && order.restaurant.nameAr
      ? order.restaurant.nameAr
      : order.restaurant.name;
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: order.restaurant.currency,
    }).format(value);

  async function sendMessage(form: FormData) {
    "use server";
    const requestHeaders = await headers();
    const ip =
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      requestHeaders.get("x-real-ip") ||
      "unknown";
    if (!(await rateLimit(`order-message:${token}:${ip}`, 20, 10 * 60 * 1000)).allowed)
      return;
    const current = await auth();
    const currentOrder = await prisma.order.findUnique({
      where: { accessToken: token },
      select: { id: true, restaurantId: true, customerUserId: true },
    });
    if (!currentOrder) return;
    const body = String(form.get("body") ?? "")
      .trim()
      .slice(0, 1000);
    if (!body) return;
    const restaurantSender = Boolean(
      current?.user.restaurantId === currentOrder.restaurantId &&
      current.user.roles.some((role) => ["RESTAURANT_OWNER", "STAFF", "SUPER_ADMIN"].includes(role)),
    );
    const linkedCustomer = current?.user.id === currentOrder.customerUserId;
    await prisma.orderMessage.create({
      data: {
        orderId: currentOrder.id,
        body,
        sender: restaurantSender ? "STAFF" : "CUSTOMER",
        userId: restaurantSender || linkedCustomer ? current!.user.id : null,
      },
    });
    revalidatePath(`/order/${token}`);
  }

  async function createCustomerAccount(form: FormData) {
    "use server";
    const parsed = accountSchema.safeParse({
      email: String(form.get("email") ?? "")
        .toLowerCase()
        .trim(),
      password: String(form.get("password") ?? ""),
    });
    if (!parsed.success) redirect(`/order/${token}?result=invalid`);
    const currentOrder = await prisma.order.findUnique({
      where: { accessToken: token },
      select: {
        id: true,
        customerUserId: true,
        customerName: true,
        customerPhone: true,
      },
    });
    if (!currentOrder) notFound();
    if (currentOrder.customerUserId) redirect(`/order/${token}`);
    try {
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: currentOrder.customerName,
            phone: currentOrder.customerPhone,
            email: parsed.data.email,
            passwordHash: await hash(parsed.data.password, 12),
            roles: { create: { role: "CUSTOMER" } },
            customerProfile: { create: {} },
          },
        });
        await tx.order.update({
          where: { id: currentOrder.id },
          data: { customerUserId: user.id },
        });
      });
    } catch {
      redirect(`/order/${token}?result=exists`);
    }
    redirect(`/order/${token}?result=created`);
  }

  async function changeQuantity(form: FormData) {
    "use server";
    const { order, session } = await requireManagedOrder(token);
    const itemId = String(form.get("itemId") ?? "");
    const delta = Number(form.get("delta")) === -1 ? -1 : 1;
    await prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId: order.id }, select: { id: true, quantity: true, productId: true, isComplimentary: true, productName: true } });
      if (!item) return;
      const quantity = Math.max(1, item.quantity + delta);
      if (quantity === item.quantity) return;
      await adjustInventory(tx, order.restaurantId, item.productId, quantity - item.quantity);
      await tx.orderItem.update({ where: { id: item.id }, data: { quantity } });
      const total = await recalculateOrder(tx, order.id);
      await tx.orderActionLog.createMany({ data: [
        { orderId: order.id, userId: session.user.id, action: delta > 0 ? "QUANTITY_INCREASED" : "QUANTITY_DECREASED", details: { item: item.productName, quantity } },
        { orderId: order.id, userId: session.user.id, action: "TOTAL_CHANGED", details: { total } },
      ] });
    });
    revalidatePath(`/order/${token}`);
    redirect(`/order/${token}?toast=orderUpdated`);
  }

  async function removeItem(form: FormData) {
    "use server";
    const { order, session } = await requireManagedOrder(token);
    const itemId = String(form.get("itemId") ?? "");
    await prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId: order.id }, select: { id: true, productId: true, quantity: true, isComplimentary: true, productName: true } });
      if (!item) return;
      await adjustInventory(tx, order.restaurantId, item.productId, -item.quantity);
      await tx.orderItem.delete({ where: { id: item.id } });
      const total = await recalculateOrder(tx, order.id);
      await tx.orderActionLog.createMany({ data: [
        { orderId: order.id, userId: session.user.id, action: "ITEM_REMOVED", details: { item: item.productName } },
        { orderId: order.id, userId: session.user.id, action: "TOTAL_CHANGED", details: { total } },
      ] });
    });
    revalidatePath(`/order/${token}`);
    redirect(`/order/${token}?toast=orderUpdated`);
  }

  async function replaceItem(form: FormData) {
    "use server";
    const { order, session } = await requireManagedOrder(token);
    const itemId = String(form.get("itemId") ?? "");
    const productId = String(form.get("productId") ?? "");
    await prisma.$transaction(async (tx) => {
      const [item, product] = await Promise.all([
        tx.orderItem.findFirst({ where: { id: itemId, orderId: order.id }, select: { id: true, productId: true, quantity: true, isComplimentary: true, productName: true } }),
        tx.product.findFirst({ where: { id: productId, restaurantId: order.restaurantId, isAvailable: true }, select: { id: true, name: true, nameAr: true, price: true } }),
      ]);
      if (!item || !product) return;
      await adjustInventory(tx, order.restaurantId, item.productId, -item.quantity);
      await adjustInventory(tx, order.restaurantId, product.id, item.quantity);
      await tx.orderItem.update({ where: { id: item.id }, data: { productId: product.id, productName: product.nameAr || product.name, unitPrice: product.price, isComplimentary: false, extras: { deleteMany: {} } } });
      const total = await recalculateOrder(tx, order.id);
      await tx.orderActionLog.createMany({ data: [
        { orderId: order.id, userId: session.user.id, action: "ITEM_REPLACED", details: { from: item.productName, to: product.name } },
        { orderId: order.id, userId: session.user.id, action: "TOTAL_CHANGED", details: { total } },
      ] });
    });
    revalidatePath(`/order/${token}`);
    redirect(`/order/${token}?toast=orderUpdated`);
  }

  async function addComplimentary(form: FormData) {
    "use server";
    const { order, session } = await requireManagedOrder(token);
    const productId = String(form.get("productId") ?? "");
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, restaurantId: order.restaurantId, isAvailable: true }, select: { id: true, name: true, nameAr: true } });
      if (!product) return;
      await adjustInventory(tx, order.restaurantId, product.id, 1);
      const name = product.nameAr || product.name;
      await tx.orderItem.create({ data: { orderId: order.id, productId: product.id, productName: name, unitPrice: 0, quantity: 1, isComplimentary: true } });
      await tx.orderActionLog.create({ data: { orderId: order.id, userId: session.user.id, action: "COMPLIMENTARY_ADDED", details: { item: name } } });
    });
    revalidatePath(`/order/${token}`);
    redirect(`/order/${token}?toast=orderUpdated`);
  }

  async function updateItemNotes(form: FormData) {
    "use server";
    const { order, session } = await requireManagedOrder(token);
    const itemId = String(form.get("itemId") ?? "");
    const notes = String(form.get("notes") ?? "").trim().slice(0, 500);
    const item = await prisma.orderItem.findFirst({ where: { id: itemId, orderId: order.id }, select: { id: true, productName: true } });
    if (!item) return;
    await prisma.$transaction([
      prisma.orderItem.update({ where: { id: item.id }, data: { notes: notes || null } }),
      prisma.orderActionLog.create({ data: { orderId: order.id, userId: session.user.id, action: "ITEM_NOTES_UPDATED", details: { item: item.productName } } }),
    ]);
    revalidatePath(`/order/${token}`);
    redirect(`/order/${token}?toast=orderUpdated`);
  }

  async function duplicateItem(form: FormData) {
    "use server";
    const { order, session } = await requireManagedOrder(token);
    const itemId = String(form.get("itemId") ?? "");
    await prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: { id: itemId, orderId: order.id },
        include: { extras: true, options: true },
      });
      if (!item) return;
      await adjustInventory(tx, order.restaurantId, item.productId, item.quantity);
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: item.productId,
          productName: item.productName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          notes: item.notes,
          isComplimentary: item.isComplimentary,
          extras: {
            create: item.extras.map((extra) => ({
              name: extra.name,
              price: extra.price,
              extraId: extra.extraId,
            })),
          },
          options: {
            create: item.options.map((option) => ({
              name: option.name,
              price: option.price,
              optionId: option.optionId,
            })),
          },
        },
      });
      await recalculateOrder(tx, order.id);
      await tx.orderActionLog.create({
        data: {
          orderId: order.id,
          userId: session.user.id,
          action: "ITEM_DUPLICATED",
          details: { item: item.productName },
        },
      });
    });
    revalidatePath(`/order/${token}`);
  }

  async function editItemOptions(form: FormData) {
    "use server";
    const { order, session } = await requireManagedOrder(token);
    const itemId = String(form.get("itemId") ?? "");
    const requestedIds = new Set(
      form.getAll("optionId").map((value) => String(value)),
    );
    await prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: { id: itemId, orderId: order.id, productId: { not: null } },
        select: {
          id: true,
          productId: true,
          productName: true,
          extras: { select: { price: true } },
        },
      });
      if (!item?.productId) return;
      const product = await tx.product.findFirst({
        where: { id: item.productId, restaurantId: order.restaurantId },
        select: {
          price: true,
          optionGroups: {
            select: {
              group: {
                select: {
                  options: {
                    select: {
                      option: {
                        select: {
                          id: true,
                          name: true,
                          nameAr: true,
                          priceAdjustment: true,
                          isAvailable: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!product) return;
      const available = product.optionGroups
        .flatMap(({ group }) => group.options.map(({ option }) => option))
        .filter((option) => option.isAvailable);
      const selected = available.filter((option) => requestedIds.has(option.id));
      const extrasTotal = item.extras.reduce(
        (sum, extra) => sum + Number(extra.price),
        0,
      );
      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          unitPrice:
            Number(product.price) +
            extrasTotal +
            selected.reduce(
              (sum, option) => sum + Number(option.priceAdjustment),
              0,
            ),
          options: {
            deleteMany: {},
            create: selected.map((option) => ({
              optionId: option.id,
              name: option.nameAr || option.name,
              price: option.priceAdjustment,
            })),
          },
        },
      });
      await recalculateOrder(tx, order.id);
      await tx.orderActionLog.create({
        data: {
          orderId: order.id,
          userId: session.user.id,
          action: "ITEM_OPTIONS_UPDATED",
          details: { item: item.productName, count: selected.length },
        },
      });
    });
    revalidatePath(`/order/${token}`);
  }

  async function updateStatus(form: FormData) {
    "use server";
    const { order, session } = await requireManagedOrder(token);
    const next = String(form.get("status"));
    const allowed = [
      "CONFIRMED",
      "PREPARING",
      "READY",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "COMPLETED",
      "CANCELLED",
      "REJECTED",
      "FAILED_DELIVERY",
    ] as const;
    if (!allowed.includes(next as (typeof allowed)[number])) return;
    if (!canTransitionOrder(order.status, next as OrderStatus)) return;
    const changed = await prisma.$transaction(async (tx) => {
      const update = await tx.order.updateMany({
        where: {
          id: order.id,
          restaurantId: order.restaurantId,
          status: order.status,
        },
        data: {
          status: next as (typeof allowed)[number],
          ...(next === "OUT_FOR_DELIVERY"
            ? { outForDeliveryAt: new Date() }
            : {}),
          ...(next === "DELIVERED" ? { deliveredAt: new Date() } : {}),
        },
      });
      if (update.count === 0) return false;
      if (["CANCELLED", "REJECTED"].includes(next)) await restoreOrderInventory(tx, order.id, order.restaurantId);
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: next as (typeof allowed)[number],
          userId: session.user.id,
        },
      });
      await tx.orderActionLog.create({
        data: {
          orderId: order.id,
          userId: session.user.id,
          action: "STATUS_CHANGED",
          details: { from: order.status, to: next },
        },
      });
      if (
        order.driverId &&
        ["DELIVERED", "COMPLETED", "CANCELLED", "FAILED_DELIVERY"].includes(
          next,
        )
      )
        await tx.deliveryDriver.update({
          where: { id: order.driverId },
          data: { status: "AVAILABLE" },
        });
      return true;
    });
    if (changed && await hasFeature(order.restaurantId, "WHATSAPP_ORDERS"))
      await sendOrderStatusNotification({
        orderId: order.id,
        status: next as (typeof allowed)[number],
        orderNumber: order.orderNumber,
        customerPhone: order.customerPhone,
        restaurantName:
          order.restaurant.locale === "ar" && order.restaurant.nameAr
            ? order.restaurant.nameAr
            : order.restaurant.name,
        customerOrderUrl: publicOrderUrl(order.accessToken),
        language: order.restaurant.locale === "ar" ? "ar" : "en",
      });
    if (changed && next === "COMPLETED" && await hasFeature(order.restaurantId, "REVIEWS") && await hasFeature(order.restaurantId, "WHATSAPP_ORDERS"))
      await sendReviewRequest({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerPhone: order.customerPhone,
        restaurantName:
          order.restaurant.locale === "ar" && order.restaurant.nameAr
            ? order.restaurant.nameAr
            : order.restaurant.name,
        reviewUrl: `${applicationUrl()}/r/${order.restaurant.slug}/review?order=${order.accessToken}`,
        language: order.restaurant.locale === "ar" ? "ar" : "en",
      });
    revalidatePath(`/order/${token}`);
  }

  async function moderateReview(form: FormData) {
    "use server";
    const { order } = await requireManagedOrder(token);
    if (!(await hasFeature(order.restaurantId, "REVIEWS"))) return;
    const status = String(form.get("status"));
    if (!["PUBLISHED", "HIDDEN"].includes(status)) return;
    await prisma.restaurantReview.updateMany({
      where: { orderId: order.id, restaurantId: order.restaurantId },
      data: {
        status: status as "PUBLISHED" | "HIDDEN",
        publishedAt: status === "PUBLISHED" ? new Date() : null,
      },
    });
    revalidatePath(`/order/${token}`);
  }

  async function sendApprovalRequest() {
    "use server";
    const { order, session } = await requireManagedOrder(token);
    const current = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { customerPhone: true, orderNumber: true, total: true, restaurant: { select: { locale: true, currency: true } } } });
    const text = await getTranslations({ locale: current.restaurant.locale, namespace: "launchPolish.orders" });
    const origin = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
    const formattedTotal = new Intl.NumberFormat(current.restaurant.locale, { style: "currency", currency: current.restaurant.currency }).format(Number(current.total));
    const message = `${text("approvalGreeting")}\n\n${text("approvalIntro")}\n${origin}/order/${token}\n\n${text("newTotal")}: ${formattedTotal}\n\n${text("approvalReply")}`;
    await prisma.$transaction(async (tx) => {
      await tx.orderActionLog.create({ data: { orderId: order.id, userId: session.user.id, action: "APPROVAL_SENT", details: { total: Number(current.total) } } });
      await createRestaurantNotification(tx, {
        restaurantId: order.restaurantId,
        type: "APPROVAL_REQUIRED",
        title: current.restaurant.locale === "ar" ? "موافقة العميل مطلوبة" : "Customer approval required",
        body: current.orderNumber,
        href: `/order/${token}`,
        dedupeKey: `approval:${order.id}:${Date.now()}`,
      });
    });
    redirect(whatsappUrl(current.customerPhone, message));
  }
  async function assignDriver(form:FormData){"use server";const{order,session}=await requireManagedOrder(token);const driverId=String(form.get("driverId"));const driver=await prisma.deliveryDriver.findFirst({where:{id:driverId,restaurantId:order.restaurantId,status:{not:"OFFLINE"}},select:{id:true,name:true}});if(!driver)return;await prisma.$transaction(async tx=>{await tx.order.update({where:{id:order.id},data:{driverId:driver.id,status:"ASSIGNED_TO_DRIVER",driverAssignedAt:new Date()}});await tx.deliveryDriver.update({where:{id:driver.id},data:{status:"BUSY"}});await tx.orderStatusHistory.create({data:{orderId:order.id,status:"ASSIGNED_TO_DRIVER",userId:session.user.id}});await tx.orderActionLog.create({data:{orderId:order.id,userId:session.user.id,action:"DRIVER_ASSIGNED",details:{driver:driver.name}}});await createRestaurantNotification(tx,{restaurantId:order.restaurantId,type:"DRIVER_ASSIGNED",title:"Driver assigned",body:driver.name,href:`/order/${token}`,dedupeKey:`driver:${order.id}:${Date.now()}`})});revalidatePath(`/order/${token}`);}
  async function submitReview(form:FormData){"use server";const current=await prisma.order.findUnique({where:{accessToken:token},select:{id:true,restaurantId:true,customerUserId:true,status:true,review:{select:{id:true}}}});if(!current||current.status!=="COMPLETED"||current.review||!(await hasFeature(current.restaurantId,"REVIEWS")))return;const score=(key:string)=>Math.max(1,Math.min(5,Number(form.get(key))||0));const overall=score("overall");if(!overall)return;await prisma.$transaction(async tx=>{await tx.restaurantReview.create({data:{restaurantId:current.restaurantId,orderId:current.id,customerUserId:current.customerUserId,foodQuality:score("foodQuality"),deliverySpeed:score("deliverySpeed"),packaging:score("packaging"),overall,comment:String(form.get("comment")||"").trim().slice(0,1000)||null}});await createRestaurantNotification(tx,{restaurantId:current.restaurantId,type:"NEW_REVIEW",title:overall<=2?"Low customer rating":"New customer review",body:`${overall}/5`,href:"/dashboard/reviews",dedupeKey:`review:${current.id}`});if(overall<=2)await createRestaurantNotification(tx,{restaurantId:current.restaurantId,type:"LOW_RATING",title:"Low customer rating",body:`${overall}/5`,href:"/dashboard/reviews",dedupeKey:`low-review:${current.id}`})});revalidatePath(`/order/${token}`);}

  const timelineStatuses = [
    "NEW",
    "CONFIRMED",
    "PREPARING",
    "READY",
    ...(order.fulfillmentType === "DELIVERY"
      ? ["ASSIGNED_TO_DRIVER", "OUT_FOR_DELIVERY", "DELIVERED"]
      : []),
    "COMPLETED",
  ];
  const terminalStatuses = ["CANCELLED", "REJECTED", "FAILED_DELIVERY"];
  if (terminalStatuses.includes(order.status))
    timelineStatuses.push(order.status);
  const manageableStatuses = [
    "CONFIRMED",
    "PREPARING",
    "READY",
    ...(order.fulfillmentType === "DELIVERY"
      ? ["OUT_FOR_DELIVERY", "DELIVERED"]
      : []),
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
    ...(order.fulfillmentType === "DELIVERY" ? ["FAILED_DELIVERY"] : []),
  ].filter((status) => status !== order.status);

  return (
    <main className="order-tracking">
      <div className="order-shell">
        <header className="order-head">
          <div>
            {order.restaurant.logoUrl ? (
              <span
                className="order-logo"
                style={{ backgroundImage: `url(${order.restaurant.logoUrl})` }}
              />
            ) : (
              <Store />
            )}
            <div>
              <small>{restaurantName}</small>
              <h1>{t("title", { number: order.orderNumber })}</h1>
              {order.branch && <p><b>{branchText("selectedBranch")}:</b> {order.branch.name}</p>}
              <p>{t("subtitle")}</p>
            </div>
          </div>
          <span className={`order-status status-${order.status.toLowerCase()}`}>
            {flow(`statuses.${order.status}`)}
          </span>
        </header>
        {isRestaurant && (
          <section className="order-command-bar order-status-control">
            <div className="current-order-state">
              <small>{t("currentStatus")}</small>
              <strong>{t(`statuses.${order.status}`)}</strong>
            </div>
            <form action={updateStatus}>
              <label>
                {t("orderActions")}
                <select name="status" defaultValue="">
                  <option value="" disabled>{t("chooseStatus")}</option>
                  {manageableStatuses.map((status) => (
                    <option value={status} key={status}>
                      {t(`statuses.${status}`)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button primary">{t("applyStatus")}</button>
            </form>
            <OrderPrintActions
              receipt={t("printReceipt")}
              kitchen={t("printKitchen")}
              restaurant={{
                name: restaurantName,
                logoUrl: order.restaurant.logoUrl,
              }}
              order={{
                number: order.orderNumber,
                date: new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(order.createdAt),
                customer: order.customerName,
                phone: order.customerPhone,
                address: order.deliveryAddress,
                currency: order.restaurant.currency,
                locale,
                subtotal: Number(order.subtotal),
                discount: Number(order.discountAmount),
                deliveryFee: Number(order.deliveryFee),
                serviceFee: Number(order.serviceFee),
                tax: Number(order.taxAmount),
                total: Number(order.total),
                items: order.items.map((item) => ({
                  name: item.productName,
                  quantity: item.quantity,
                  unitPrice: Number(item.unitPrice),
                  notes: item.notes,
                  options: [
                    ...item.extras.map((extra) => extra.name),
                    ...item.options.map((option) => option.name),
                  ],
                })),
              }}
              labels={{
                invoice: t("invoice"),
                kitchenTicket: t("kitchenTicket"),
                customer: t("customer"),
                phone: t("phone"),
                address: t("address"),
                item: t("items"),
                quantity: t("quantity"),
                unitPrice: t("unitPrice"),
                subtotal: t("subtotal"),
                discount: t("discount"),
                deliveryFee: t("deliveryFee"),
                serviceFee: t("serviceFee"),
                tax: t("tax"),
                total: t("total"),
                notes: t("notes"),
              }}
            />
            {reviewsAvailable && order.status === "COMPLETED" && (
              <a
                className="button whatsapp-button"
                target="_blank"
                rel="noreferrer"
                href={whatsappUrl(
                  order.customerPhone,
                  `${locale === "ar" ? "شكراً لطلبك ❤️\nنسعد بتقييم تجربتك معنا." : "Thank you for your order ❤️\nWe would love your feedback."}\n\n${applicationUrl()}/r/${order.restaurant.slug}/review?order=${order.accessToken}`,
                )}
              >
                <MessageCircle />
                {locale === "ar" ? "إرسال طلب تقييم" : "Send review request"}
              </a>
            )}
          </section>
        )}
        <section className="order-layout">
          <div className="order-column">
            <AccordionSection title={t("items")} className="order-card order-items-card">
              {order.items.map((item) => (
                <div className="tracking-item" key={item.id}>
                  <span
                    className="order-item-image"
                    style={
                      item.product?.images[0]?.url
                        ? {
                            backgroundImage: `url(${item.product.images[0].url})`,
                          }
                        : undefined
                    }
                  />
                  <span>
                    <b>
                      {item.quantity} × {item.productName}
                    </b>
                    {item.extras.length > 0 && (
                      <small>
                        {item.extras.map((extra) => extra.name).join("، ")}
                      </small>
                    )}
                    {item.options.length>0&&<small>{item.options.map(option=>option.name).join("، ")}</small>}
                    {item.notes && <small>{item.notes}</small>}
                  </span>
                  <strong>
                    {item.isComplimentary ? flow("complimentary") : money(Number(item.unitPrice) * item.quantity)}
                  </strong>
                  {isRestaurant && <div className="order-item-management">
                    <div className="order-item-quick-actions"><form action={changeQuantity}><input type="hidden" name="itemId" value={item.id}/><button name="delta" value="-1" title={flow("decrease")}><Minus /></button><button name="delta" value="1" title={flow("increase")}><Plus /></button></form>
                    <form action={removeItem}><input type="hidden" name="itemId" value={item.id}/><button className="danger-action" title={flow("remove")}><Trash2 /></button></form>
                    <form action={duplicateItem}><input type="hidden" name="itemId" value={item.id}/><button title={t("duplicate")}><Copy /></button></form></div>
                    <form action={replaceItem} className="replace-item-form"><input type="hidden" name="itemId" value={item.id}/><select name="productId" aria-label={flow("replaceWith")}>{order.restaurant.products.map(product=><option value={product.id} key={product.id}>{locale==="ar"&&product.nameAr?product.nameAr:product.name}</option>)}</select><button title={flow("replace")}><RefreshCw /></button></form>
                    <form action={updateItemNotes} className="item-notes-form"><input type="hidden" name="itemId" value={item.id}/><input name="notes" defaultValue={item.notes??""} placeholder={flow("itemNotes")} maxLength={500}/><button>{flow("addNotes")}</button></form>
                    {item.productId&&order.restaurant.products.some(product=>product.id===item.productId&&product.optionGroups.some(({group})=>group.options.some(({option})=>option.isAvailable)))&&<details className="edit-item-options"><summary>{t("editOptions")}</summary><form action={editItemOptions}><input type="hidden" name="itemId" value={item.id}/>{order.restaurant.products.find(product=>product.id===item.productId)?.optionGroups.flatMap(({group})=>group.options).filter(({option})=>option.isAvailable).map(({option})=><label key={option.id}><input type="checkbox" name="optionId" value={option.id} defaultChecked={item.options.some(selected=>selected.optionId===option.id)}/><span>{locale==="ar"&&option.nameAr?option.nameAr:option.name}</span><small>{Number(option.priceAdjustment)>=0?"+":""}{money(Number(option.priceAdjustment))}</small></label>)}<button className="button primary">{t("saveOptions")}</button></form></details>}
                  </div>}
                </div>
              ))}
              {isRestaurant && <form action={addComplimentary} className="complimentary-form"><select name="productId">{order.restaurant.products.map(product=><option value={product.id} key={product.id}>{locale==="ar"&&product.nameAr?product.nameAr:product.name}</option>)}</select><button className="button ghost"><Gift />{flow("complimentary")}</button></form>}
            </AccordionSection>
            <AccordionSection title={t("total")} className="order-card order-pricing-card">
              <div className="order-pricing-summary">
                <p><span>{t("subtotal")}</span><b>{money(Number(order.subtotal))}</b></p>
                <p><span>{t("discount")}</span><b>- {money(Number(order.discountAmount))}</b></p>
                {order.promotionOrders.length > 0 && <div className="applied-promotions"><b>{promotionText("appliedPromotions")}</b>{order.promotionOrders.map((promotion)=><span key={promotion.id}>{promotion.promotionName} · −{money(Number(promotion.discountAmount))}</span>)}{order.couponCode&&<code>{order.couponCode}</code>}</div>}
                <p><span>{t("deliveryFee")}</span><b>{money(Number(order.deliveryFee))}</b></p>
                <p><span>{t("serviceFee")}</span><b>{money(Number(order.serviceFee))}</b></p>
                <p><span>{t("tax")}</span><b>{money(Number(order.taxAmount))}</b></p>
                <p className="tracking-total"><span>{t("total")}</span><strong>{money(Number(order.total))}</strong></p>
              </div>
              {isRestaurant && <form action={sendApprovalRequest}><button className="button whatsapp-button approval-button"><MessageCircle />{flow("sendApproval")}</button></form>}
              {isRestaurant&&order.fulfillmentType==="DELIVERY"&&<form action={assignDriver} className="driver-assignment"><select name="driverId" defaultValue={order.driverId??""}><option value="">{deliveryText("assign")}</option>{order.restaurant.drivers.filter(driver=>driver.status!=="OFFLINE"||driver.id===order.driverId).map(driver=><option key={driver.id} value={driver.id}>{driver.name} · {deliveryText(driver.status.toLowerCase() as "available"|"busy"|"offline")}</option>)}</select><button className="button primary">{deliveryText("assign")}</button></form>}
            </AccordionSection>
            {order.driver&&<article className="order-card driver-public-card">{order.driver.photoUrl&&<span style={{backgroundImage:`url(${order.driver.photoUrl})`}}/>}<div><h2>{order.driver.name}</h2><p>{order.driver.vehicleType}</p><a href={`tel:${order.driver.phone}`}>{order.driver.phone}</a>{order.driver.whatsapp&&<a className="button whatsapp-button" href={`https://wa.me/${order.driver.whatsapp}`}>{deliveryText("whatsapp")}</a>}{order.status==="OUT_FOR_DELIVERY"&&order.deliveryLatitude!=null&&order.deliveryLongitude!=null&&<a className="button ghost" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${Number(order.deliveryLatitude)},${Number(order.deliveryLongitude)}`}>{mapsText("openGoogle")}</a>}{order.estimatedArrivalAt&&<small>{deliveryText("eta")}: {new Intl.DateTimeFormat(locale,{timeStyle:"short"}).format(order.estimatedArrivalAt)}</small>}</div></article>}
            {reviewsAvailable&&order.status==="COMPLETED"&&!order.review&&<article className="order-card"><h2>{reviewText("title")}</h2><form action={submitReview} className="review-form">{[["foodQuality","food"],["deliverySpeed","speed"],["packaging","packaging"],["overall","overall"]].map(([name,key])=><label key={name}>{reviewText(key as "food"|"speed"|"packaging"|"overall")}<select name={name} required defaultValue="5">{[5,4,3,2,1].map(value=><option key={value} value={value}>{"★".repeat(value)}</option>)}</select></label>)}<textarea name="comment" maxLength={1000} placeholder={reviewText("comment")}/><button className="button primary">{reviewText("submit")}</button></form></article>}
            {reviewsAvailable&&isRestaurant&&order.review&&<article className="order-card order-review-card"><header><h2>{t("rating")}</h2><span>{t(order.review.status==="PUBLISHED"?"published":order.review.status==="HIDDEN"?"hidden":"pendingReview")}</span></header><div><p><b>{order.review.foodQuality}/5</b>{t("foodRating")}</p><p><b>{order.review.deliverySpeed}/5</b>{t("deliveryRating")}</p><p><b>{order.review.packaging}/5</b>{t("packagingRating")}</p><p><b>{order.review.overall}/5</b>{t("overallRating")}</p></div>{order.review.comment&&<blockquote>{order.review.comment}</blockquote>}<form action={moderateReview}><button name="status" value="PUBLISHED" className="button primary">{t("publish")}</button><button name="status" value="HIDDEN" className="button ghost">{t("hide")}</button></form></article>}
            <AccordionSection title={t("conversation")} className="order-card order-conversation-card">
              <div className="order-messages">
                {order.messages.length ? (
                  order.messages.map((message) => {
                    const fromRestaurant = message.sender !== "CUSTOMER";
                    return (
                      <div
                        className={`order-message ${fromRestaurant ? "restaurant-message" : "customer-message"}`}
                        key={message.id}
                      >
                        <small>
                          {fromRestaurant
                            ? t("restaurantSender")
                            : t("customerSender")}
                        </small>
                        <p>{message.body}</p>
                        <time>
                          {new Intl.DateTimeFormat(locale, {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(message.createdAt)}
                        </time>
                      </div>
                    );
                  })
                ) : (
                  <p>{t("noMessages")}</p>
                )}
              </div>
              <form action={sendMessage} className="message-form">
                <textarea
                  name="body"
                  required
                  maxLength={1000}
                  placeholder={t("messagePlaceholder")}
                />
                <button className="button primary">
                  <MessageCircle />
                  {t("send")}
                </button>
              </form>
            </AccordionSection>
          </div>
          <aside className="order-column">
            <details className="order-card order-details customer-details">
              <summary>
                <h2>{t("customer")}</h2>
                <span className={order.customerUserId ? "saved-customer" : "guest-customer"}>
                  {order.customerUserId ? t("savedCustomer") : t("guestCustomer")}
                </span>
              </summary>
              <p>
                <UserRound />
                {order.customerName}
              </p>
              <p>
                <Phone />
                {order.customerPhone}
              </p>
              {order.deliveryAddress && (
                <p>
                  <b>{t("address")}:</b> {order.deliveryAddress}
                </p>
              )}              {order.notes && (
                <p>
                  <b>{t("notes")}:</b> {order.notes}
                </p>
              )}
              {customerMetrics && (
                <div className="customer-metrics">
                  <span><b>{customerMetrics._count._all}</b>{t("orderCount")}</span>
                  <span><b>{money(Number(customerMetrics._sum.total ?? 0))}</b>{t("totalSpending")}</span>
                </div>
              )}
              {isRestaurant && (
                <div className="customer-actions-grid">
                  <CustomerQuickActions
                  phone={order.customerPhone}
                  labels={{
                    call: t("call"),
                    whatsapp: t("whatsapp"),
                    copyAddress: t("copyAddress"),
                    maps: t("openMaps"),
                  }}
                  />
                  {order.deliveryLatitude != null && order.deliveryLongitude != null && (
                    <OrderLocationActions
                      latitude={Number(order.deliveryLatitude)}
                      longitude={Number(order.deliveryLongitude)}
                      labels={{
                        view: mapsText("viewLocation"),
                        title: mapsText("deliveryTitle"),
                        openGoogle: mapsText("openGoogle"),
                        copy: mapsText("copyCoordinates"),
                        copied: mapsText("coordinatesCopied"),
                      }}
                    />
                  )}
                </div>
              )}
            </details>
            <AccordionSection title={flow("timeline")} className="order-card order-timeline-card">
              <div className="order-timeline">
                {timelineStatuses.filter((status) => status === order.status || order.statusHistory.some((item) => item.status === status)).map((status) => {
                  const entry = [...order.statusHistory].reverse().find((item) => item.status === status);
                  return <div className={`timeline-entry ${entry ? `status-${status.toLowerCase()} completed-step` : "pending-step"}`} key={status}><i /><time>{entry ? new Intl.DateTimeFormat(locale,{hour:"2-digit",minute:"2-digit"}).format(entry.createdAt) : "—"}</time><strong>{t(`statuses.${status}`)}</strong></div>;
                })}
              </div>
            </AccordionSection>
            {isRestaurant && order.actionLogs.length > 0 && <AccordionSection title={flow("actionLog")} className="order-card"><div className="order-action-log">{order.actionLogs.map(log=><div key={log.id}><span><b>{log.user?.name??restaurantName}</b>{flow.has(`actions.${log.action}`)?flow(`actions.${log.action}`):log.action}</span><time>{new Intl.DateTimeFormat(locale,{dateStyle:"short",timeStyle:"short"}).format(log.createdAt)}</time></div>)}</div></AccordionSection>}
            {!order.customerUserId && !isRestaurant && (
              <AccordionSection title={t("createAccount")} className="order-card">
                <p>{t("accountHelp")}</p>
                {result === "invalid" && (
                  <p className="form-error">{t("invalidAccount")}</p>
                )}
                {result === "exists" && (
                  <p className="form-error">{t("emailExists")}</p>
                )}
                <form
                  action={createCustomerAccount}
                  className="tracking-register"
                >
                  <label>
                    {t("email")}
                    <input name="email" type="email" required />
                  </label>
                  <label>
                    {t("password")}
                    <input
                      name="password"
                      type="password"
                      minLength={8}
                      pattern="(?=.*[A-Z])(?=.*[0-9]).{8,}"
                      required
                    />
                    <small>{t("passwordHint")}</small>
                  </label>
                  <button className="button primary">{t("register")}</button>
                </form>
              </AccordionSection>
            )}
            {(result === "created" || isLinkedCustomer) && (
              <p className="form-success">{t("accountCreated")}</p>
            )}
            <Link
              href={`/menu/${order.restaurant.slug}`}
              className="order-muted-link"
            >
              MenuQR
            </Link>
          </aside>
        </section>
      </div>
    </main>
  );
}
