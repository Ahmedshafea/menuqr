import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { checkoutSchema } from "@/lib/validators";
import { whatsappUrl } from "@/lib/utils";
import { isRestaurantOpen } from "@/lib/restaurant-hours";
import { apiError, logApiError, rateLimitError } from "@/lib/api";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { auth } from "@/auth";
import { hash } from "bcryptjs";
import { createRestaurantNotification } from "@/lib/restaurant-notifications";
import { isDemoSlug } from "@/lib/demo-restaurants";
import { calculateOrderPricing } from "@/lib/order-pricing";
import { isWhatsAppConfigured, sendCustomerNotification, sendRestaurantNotification } from "@/lib/whatsapp";

export async function POST(request: Request) {
  const session = await auth();
  const ip = requestIp(request);
  const limited = rateLimit(`orders:${ip}`, 10, 10 * 60 * 1000);
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
      whatsapp: true,
      currency: true,
      locale: true,
      isActive: true,
      settings: { select: { allowOrdering: true, allowOrdersOutsideHours: true,offersDelivery:true,offersPickup:true,offersDineIn:true,deliveryFee:true,deliveryFeeType:true,serviceFee:true,serviceFeeType:true,taxRate:true,taxType:true,discountValue:true,discountType:true } },
      branches: {
        where: { isActive: true },
        select: {
          workingHours: {
            select: {
              dayOfWeek: true,
              opensAt: true,
              closesAt: true,
              isClosed: true,
            },
          },
        },
        take: 1,
      },
      products: {
        where: {
          id: { in: data.items.map((item) => item.productId) },
          availability: "AVAILABLE",
        },
        select: {
          id: true,
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
  if((data.fulfillmentType==="DELIVERY"&&!restaurant.settings?.offersDelivery)||(data.fulfillmentType==="PICKUP"&&!restaurant.settings?.offersPickup)||(data.fulfillmentType==="DINE_IN"&&!restaurant.settings?.offersDineIn))return apiError("FULFILLMENT_UNAVAILABLE",409);
  const arabic = restaurant.locale === "ar";
  if (
    !(restaurant.settings?.allowOrdering ?? true) ||
    !restaurant.branches[0] ||
    (!restaurant.settings?.allowOrdersOutsideHours && !isRestaurantOpen(restaurant.branches[0].workingHours))
  )
    return apiError("ORDERING_CLOSED", 409);
  const productMap = new Map(
    restaurant.products.map((product) => [product.id, product]),
  );
  if (
    data.items.some((item) => {
      const product = productMap.get(item.productId);
      return (
        !product || (product.stock !== null && product.stock < item.quantity)
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
  const pricing = calculateOrderPricing(total, data.fulfillmentType, restaurant.settings ? {
    ...restaurant.settings,
    deliveryFee: Number(restaurant.settings.deliveryFee),
    serviceFee: Number(restaurant.settings.serviceFee),
    taxRate: Number(restaurant.settings.taxRate),
    discountValue: Number(restaurant.settings.discountValue),
  } : {});
  const number = `MQ-${Date.now().toString(36).toUpperCase()}`;
  // 72 bits of cryptographic entropy keeps public order links unguessable while
  // producing a clean 12-character code that is easier to share on WhatsApp.
  const accessToken = randomBytes(9).toString("base64url");
  if (!session && data.createAccount && data.email) {
    const existingAccount = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (existingAccount) return apiError("ACCOUNT_EXISTS", 409);
  }
  const order = await prisma.$transaction(async (transaction) => {
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
        discountAmount: pricing.discountAmount,
        deliveryFee: pricing.deliveryFee,
        serviceFee: pricing.serviceFee,
        taxAmount: pricing.taxAmount,
        total: pricing.total,
        customerUserId,
        restaurantId: restaurant.id,
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
      title: arabic ? `طلب جديد #${number}` : `New order #${number}`,
      body: data.customerName,
      href: `/order/${accessToken}`,
      dedupeKey: `order:${created.id}`,
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
    for (const value of verified)
      if (value.product.stock !== null) {
        const updatedProduct = await transaction.product.update({
          where: { id: value.product.id },
          data: { stock: { decrement: value.item.quantity } },
          select: { stock: true },
        });
        if (updatedProduct.stock !== null && updatedProduct.stock <= 0)
          await createRestaurantNotification(transaction, {
            restaurantId: restaurant.id,
            type: "OUT_OF_STOCK",
            title: arabic ? "نفد مخزون منتج" : "Product is out of stock",
            body: value.displayName,
            href: "/dashboard/menu",
            dedupeKey: `out-of-stock:${value.product.id}:${new Date().toISOString().slice(0, 10)}`,
          });
      }
    return created;
  });
  const restaurantName =
    arabic && restaurant.nameAr ? restaurant.nameAr : restaurant.name;
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;
  const trackingUrl = `${origin}/order/${accessToken}`;
  const message = arabic
    ? `طلب جديد #${number} من ${data.customerName} إلى ${restaurantName}\n\nعرض الطلب والتواصل مع العميل:\n${trackingUrl}`
    : `New order #${number} from ${data.customerName} for ${restaurantName}\n\nView the order and contact the customer:\n${trackingUrl}`;
  if (isWhatsAppConfigured()) {
    const language = arabic ? "ar" : "en";
    const results = await Promise.allSettled([
      sendCustomerNotification("order_received", data.customerPhone, [number, restaurantName, trackingUrl], language),
      sendRestaurantNotification("new_order", restaurant.whatsapp, [number, data.customerName, pricing.total, trackingUrl], language),
    ]);
    results.forEach((result, index) => {
      if (result.status === "rejected")
        logApiError("whatsapp-order-notification", result.reason, { audience: index === 0 ? "customer" : "restaurant", orderId: order.id });
    });
  }
  return Response.json(
    {
      orderId: order.id,
      orderNumber: number,
      trackingUrl,
      whatsappUrl: whatsappUrl(restaurant.whatsapp, message),
    },
    { status: 201 },
  );
}
