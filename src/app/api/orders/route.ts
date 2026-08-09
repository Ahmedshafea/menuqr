import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkoutSchema } from "@/lib/validators";
import { publicOrderUrl } from "@/lib/utils";
import { isRestaurantOpen } from "@/lib/restaurant-hours";
import { apiError, logApiError, rateLimitError } from "@/lib/api";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { auth } from "@/auth";
import { hash } from "bcryptjs";
import { createRestaurantNotification } from "@/lib/restaurant-notifications";
import { isDemoSlug } from "@/lib/demo-restaurants";
import { calculateOrderPricing } from "@/lib/order-pricing";
import { sendOrderCreatedNotifications } from "@/lib/whatsapp";
import { hasFeature } from "@/lib/subscription-plans";
import { calculatePromotions } from "@/lib/promotion-engine";
import {
  getPromotionCandidates,
  promotionCustomerKey,
  recordPromotionUsage,
} from "@/lib/promotions";
import { branchWhatsapp } from "@/lib/branches";
import { aggregateCartQuantities, reserveInventory } from "@/lib/inventory";

export async function POST(request: Request) {
  const session = await auth();
  const ip = requestIp(request);
  const limited = await rateLimit(`orders:${ip}`, 10, 10 * 60 * 1000);
  if (!limited.allowed) return rateLimitError(limited.retryAfter);
  const parsed = checkoutSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return apiError("INVALID_ORDER", 400, parsed.error.flatten().fieldErrors);
  const data = parsed.data;
  if (isDemoSlug(data.restaurantSlug))
    return apiError("DEMO_READ_ONLY", 403);
  if (!(await verifyTurnstile(request, data.turnstileToken)))
    return apiError("TURNSTILE_FAILED", 400);
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: data.restaurantSlug },
    select: {
      id: true,
      name: true,
      nameAr: true,
      phone: true,
      whatsapp: true,
      currency: true,
      locale: true,
      isActive: true,
      settings: { select: { allowOrdering: true, allowOrdersOutsideHours: true,offersDelivery:true,offersPickup:true,offersDineIn:true,deliveryFee:true,deliveryFeeType:true,serviceFee:true,serviceFeeType:true,taxRate:true,taxType:true } },
      branches: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          slug: true,
          phone: true,
          whatsappNumber: true,
          useRestaurantWhatsapp: true,
          workingHours: {
            select: {
              dayOfWeek: true,
              opensAt: true,
              closesAt: true,
              isClosed: true,
            },
          },
        },
      },
      products: {
        where: {
          id: { in: data.items.map((item) => item.productId) },
          availability: "AVAILABLE",
        },
        select: {
          id: true,
          categoryId: true,
          name: true,
          nameAr: true,
          price: true,
          stock: true,
          extras: {
            select: {
              id: true,
              name: true,
              nameAr: true,
              price: true,
              isAvailable: true,
            },
          },
          optionGroups: { select: { group: { select: { id:true,name:true,nameAr:true,isRequired:true,minSelections:true,maxSelections:true,options:{select:{option:{select:{id:true,name:true,nameAr:true,priceAdjustment:true,isAvailable:true}}}} } } } },
        },
      },
    },
  });
  if (!restaurant?.isActive) return apiError("RESTAURANT_UNAVAILABLE", 404);
  const selectedBranch = data.branchId
    ? restaurant.branches.find((branch) => branch.id === data.branchId)
    : restaurant.branches.length === 1
      ? restaurant.branches[0]
      : null;
  if (data.branchId && !selectedBranch)
    return apiError("BRANCH_UNAVAILABLE", 409);
  if (!data.branchId && restaurant.branches.length > 1)
    return apiError("BRANCH_REQUIRED", 409);
  if((data.fulfillmentType==="DELIVERY"&&!restaurant.settings?.offersDelivery)||(data.fulfillmentType==="PICKUP"&&!restaurant.settings?.offersPickup)||(data.fulfillmentType==="DINE_IN"&&!restaurant.settings?.offersDineIn))return apiError("FULFILLMENT_UNAVAILABLE",409);
  const arabic = restaurant.locale === "ar";
  if (
    !(restaurant.settings?.allowOrdering ?? true) ||
    !selectedBranch ||
    (!restaurant.settings?.allowOrdersOutsideHours && !isRestaurantOpen(selectedBranch.workingHours))
  )
    return apiError("ORDERING_CLOSED", 409);
  const productMap = new Map(
    restaurant.products.map((product) => [product.id, product]),
  );
  const requestedQuantities = aggregateCartQuantities(data.items);
  if (
    [...requestedQuantities].some(([productId, quantity]) => {
      const product = productMap.get(productId);
      return (
        !product || (product.stock !== null && product.stock < quantity)
      );
    })
  )
    return apiError("PRODUCT_UNAVAILABLE", 409);
  let total = 0;
  let invalidOptionSelection = false;
  const verified = data.items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) throw new Error("Validated product missing");
    const extras = item.extras
      .map((selected) =>
        product.extras.find(
          (extra) => extra.id === selected.id && extra.isAvailable,
        ),
      )
      .filter(Boolean);
    const selectedIds=new Set(item.extras.map(extra=>extra.id));
    const optionSelections=product.optionGroups.flatMap(({group})=>{
      const available=group.options.map(({option})=>option).filter(option=>option.isAvailable);
      const selected=available.filter(option=>selectedIds.has(option.id));
      if (!available.length) return [];
      const minimum = group.isRequired
        ? Math.max(1, group.minSelections)
        : 0;
      const maximum = group.isRequired
        ? group.maxSelections
        : available.length;
      if(selected.length<minimum||selected.length>maximum) invalidOptionSelection=true;
      return selected;
    });
    const unit = Math.max(
      0,
      Number(product.price) +
        extras.reduce((sum, extra) => sum + Number(extra!.price), 0) +
        optionSelections.reduce(
          (sum, option) => sum + Number(option.priceAdjustment),
          0,
        ),
    );
    total += unit * item.quantity;
    return {
      item,
      product,
      extras,
      optionSelections,
      unit,
      displayName: arabic && product.nameAr ? product.nameAr : product.name,
    };
  });
  if(invalidOptionSelection)return apiError("INVALID_OPTION_SELECTION",409);
  const customerKey = promotionCustomerKey(data.customerPhone);
  const [promotionCandidates, customerOrderCount] = await Promise.all([
    getPromotionCandidates({
      restaurantId: restaurant.id,
      customerUserId: session?.user.id,
      customerKey,
    }),
    prisma.order.count({
      where: session?.user.id
        ? { restaurantId: restaurant.id, customerUserId: session.user.id }
        : {
            restaurantId: restaurant.id,
            customerPhone: { endsWith: customerKey },
          },
    }),
  ]);
  const promotionCalculation = calculatePromotions(promotionCandidates, {
    subtotal: total,
    lines: verified.map((value) => ({
      productId: value.product.id,
      categoryId: value.product.categoryId,
      unitPrice: value.unit,
      quantity: value.item.quantity,
    })),
    fulfillmentType: data.fulfillmentType,
    branchId: selectedBranch.id,
    customerOrderCount,
    couponCode: data.couponCode,
  });
  if (data.couponCode && promotionCalculation.couponError)
    return apiError(promotionCalculation.couponError, 409);
  const pricing = calculateOrderPricing(total, data.fulfillmentType, restaurant.settings ? {
    ...restaurant.settings,
    deliveryFee: Number(restaurant.settings.deliveryFee),
    serviceFee: Number(restaurant.settings.serviceFee),
    taxRate: Number(restaurant.settings.taxRate),
  } : {}, promotionCalculation);
  const number = `MQ-${Date.now().toString(36).toUpperCase()}`;
  // 72 bits of cryptographic entropy keeps public order links unguessable while
  // producing a clean 12-character code that is easier to share on WhatsApp.
  const accessToken = randomBytes(9).toString("base64url");
  if (!session && data.createAccount && data.email) {
    const existingAccount = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (existingAccount) return apiError("ACCOUNT_EXISTS", 409);
  }
  let order;
  try {
    order = await prisma.$transaction(async (transaction) => {
    try {
      await reserveInventory(transaction, restaurant.id, requestedQuantities, new Set(restaurant.products.filter((product) => product.stock !== null).map((product) => product.id)));
    } catch (error) {
      console.warn(JSON.stringify({ level: "warn", context: "inventory", event: "reservation_failed", restaurantId: restaurant.id, timestamp: new Date().toISOString() }));
      throw error;
    }
    let customerUserId = session?.user.id ?? null;
    if (customerUserId) {
      await transaction.userRole.upsert({
        where: { userId_role: { userId: customerUserId, role: "CUSTOMER" } },
        create: { userId: customerUserId, role: "CUSTOMER" },
        update: {},
      });
      await transaction.customerProfile.upsert({
        where: { userId: customerUserId },
        create: { userId: customerUserId },
        update: {},
      });
    } else if (data.createAccount && data.email && data.password) {
      const user = await transaction.user.create({
        data: {
          name: data.customerName,
          phone: data.customerPhone.replace(/\D/g, ""),
          email: data.email,
          passwordHash: await hash(data.password, 12),
          roles: { create: { role: "CUSTOMER" } },
          customerProfile: { create: {} },
        },
        select: { id: true },
      });
      customerUserId = user.id;
    }
    const created = await transaction.order.create({
      data: {
        orderNumber: number,
        accessToken,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        deliveryAddress: data.deliveryAddress,
        deliveryLatitude: data.deliveryLatitude,
        deliveryLongitude: data.deliveryLongitude,
        street: data.street,
        district: data.district,
        city: data.city,
        governorate: data.governorate,
        country: data.country,
        postalCode: data.postalCode,
        buildingName: data.buildingName,
        floor: data.floor,
        apartment: data.apartment,
        landmark: data.landmark,
        deliveryNotes: data.deliveryNotes,
        notes: data.notes,
        subtotal: pricing.subtotal,
        originalSubtotal: pricing.subtotal,
        finalSubtotal: pricing.discountedSubtotal,
        couponCode: promotionCalculation.couponCode,
        discountAmount: pricing.discountAmount,
        deliveryFee: pricing.deliveryFee,
        serviceFee: pricing.serviceFee,
        taxAmount: pricing.taxAmount,
        total: pricing.total,
        customerUserId,
        restaurantId: restaurant.id,
        branchId: selectedBranch.id,
        fulfillmentType:data.fulfillmentType,
        statusHistory: { create: { status: "NEW", userId: customerUserId } },
        items: {
          create: verified.map((value) => ({
            productName: value.displayName,
            unitPrice: value.unit,
            quantity: value.item.quantity,
            productId: value.product.id,
            extras: {
              create: value.extras.map((extra) => ({
                name: arabic && extra!.nameAr ? extra!.nameAr : extra!.name,
                price: extra!.price,
                extraId: extra!.id,
              })),
            },
            options: { create: value.optionSelections.map(option=>({name:arabic&&option.nameAr?option.nameAr:option.name,price:option.priceAdjustment,optionId:option.id})) },
          })),
        },
      },
    });
    await createRestaurantNotification(transaction, {
      restaurantId: restaurant.id,
      type: "NEW_ORDER",
      title: arabic
        ? `طلب جديد #${number} — ${selectedBranch.name}`
        : `New order #${number} — ${selectedBranch.name}`,
      body: data.customerName,
      href: `/order/${accessToken}`,
      dedupeKey: `order:${created.id}`,
    });
    await recordPromotionUsage(transaction, {
      restaurantId: restaurant.id,
      orderId: created.id,
      customerUserId,
      customerKey,
      couponCode: promotionCalculation.couponCode,
      appliedPromotions: promotionCalculation.appliedPromotions,
    });
    if (customerUserId)
      await createRestaurantNotification(transaction, {
        restaurantId: restaurant.id,
        type: "NEW_CUSTOMER",
        title: arabic ? "عميل جديد" : "New customer",
        body: data.customerName,
        href: "/dashboard/customers",
        dedupeKey: `customer:${customerUserId}`,
      });
    for (const [productId] of requestedQuantities) {
      const value = verified.find((entry) => entry.product.id === productId)!;
      if (value.product.stock !== null) {
        const updatedProduct = await transaction.product.findUnique({ where: { id: productId }, select: { stock: true } });
        if (updatedProduct?.stock !== null && updatedProduct?.stock !== undefined && updatedProduct.stock <= 0)
          await createRestaurantNotification(transaction, {
            restaurantId: restaurant.id,
            type: "OUT_OF_STOCK",
            title: arabic ? "نفد مخزون منتج" : "Product is out of stock",
            body: value.displayName,
            href: "/dashboard/menu",
            dedupeKey: `out-of-stock:${value.product.id}:${new Date().toISOString().slice(0, 10)}`,
          });
      }
    }
    return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (
      (error instanceof Error &&
        ["PROMOTION_USAGE_CONFLICT", "COUPON_USAGE_CONFLICT", "INVENTORY_CONFLICT"].includes(
          error.message,
        )) ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034")
    )
      return apiError(
        error instanceof Error &&
          ["PROMOTION_USAGE_CONFLICT", "COUPON_USAGE_CONFLICT", "INVENTORY_CONFLICT"].includes(
            error.message,
          )
          ? error.message
          : "ORDER_CONFLICT_RETRY",
        409,
      );
    throw error;
  }
  const restaurantName =
    arabic && restaurant.nameAr ? restaurant.nameAr : restaurant.name;
  const trackingUrl = publicOrderUrl(accessToken, request.url);
  const destinationWhatsapp = branchWhatsapp(
    selectedBranch,
    restaurant.whatsapp,
  );
  const baseMessage = arabic
    ? `طلب جديد #${number} من ${data.customerName} إلى ${restaurantName}\n\nعرض الطلب والتواصل مع العميل:\n${trackingUrl}`
    : `New order #${number} from ${data.customerName} for ${restaurantName}\n\nView the order and contact the customer:\n${trackingUrl}`;
  const message = arabic
    ? `الفرع: ${selectedBranch.name}\n\n${baseMessage}`
    : `Branch: ${selectedBranch.name}\n\n${baseMessage}`;
  try {
    const notificationLocale = arabic ? "ar-EG" : "en";
    const formattedTotal = new Intl.NumberFormat(notificationLocale, {
      style: "currency",
      currency: restaurant.currency,
    }).format(pricing.total);
    const fulfillmentLabel = arabic
      ? {
          DELIVERY: "توصيل",
          PICKUP: "استلام من المطعم",
          DINE_IN: "داخل المطعم",
        }[data.fulfillmentType]
      : {
          DELIVERY: "Delivery",
          PICKUP: "Pickup",
          DINE_IN: "Dine-in",
        }[data.fulfillmentType];
    const orderType = `${fulfillmentLabel} — ${selectedBranch.name}`;
    const orderTime = new Intl.DateTimeFormat(notificationLocale, {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Africa/Cairo",
    }).format(order.createdAt);
    if (await hasFeature(restaurant.id, "WHATSAPP_ORDERS")) await sendOrderCreatedNotifications({
      orderId: order.id,
      orderAccessToken: accessToken,
      orderNumber: number,
      restaurantName,
      restaurantPhone:
        selectedBranch.phone || restaurant.phone || restaurant.whatsapp,
      restaurantRecipientPhone: destinationWhatsapp,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      total: formattedTotal,
      orderType,
      orderTime,
      language: arabic ? "ar" : "en",
    });
  } catch (error) {
    // Defensive boundary: order creation must succeed even if an unexpected
    // notification integration error escapes the reusable service.
    logApiError("whatsapp-order-notifications", error, { orderId: order.id });
  }
  return Response.json(
    {
      orderId: order.id,
      orderNumber: number,
      trackingUrl,
    },
    { status: 201 },
  );
}
