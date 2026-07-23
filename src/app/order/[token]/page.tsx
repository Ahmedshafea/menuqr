import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { MessageCircle, Phone, Store, UserRound } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { whatsappUrl } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";

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
  const [session, t, locale, order] = await Promise.all([
    auth(),
    getTranslations("orderTracking"),
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
          },
        },
        items: { select: { id: true, productName: true, unitPrice: true, quantity: true, extras: { select: { id: true, name: true, price: true } } } },
        messages: {
          orderBy: { createdAt: "asc" },
          select: { id: true, body: true, sender: true, createdAt: true },
        },
      },
    }),
  ]);
  if (!order) notFound();
  const isRestaurant = Boolean(
    session?.user.restaurantId === order.restaurantId &&
    session.user.roles.some((role) => ["RESTAURANT_OWNER", "STAFF", "SUPER_ADMIN"].includes(role)),
  );
  const isLinkedCustomer = session?.user.id === order.customerUserId;
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
    if (!rateLimit(`order-message:${token}:${ip}`, 20, 10 * 60 * 1000).allowed)
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
              <p>{t("subtitle")}</p>
            </div>
          </div>
          <span className={`order-status status-${order.status.toLowerCase()}`}>
            {t(`statuses.${order.status}`)}
          </span>
        </header>
        <section className="order-layout">
          <div className="order-column">
            <article className="order-card">
              <h2>{t("items")}</h2>
              {order.items.map((item) => (
                <div className="tracking-item" key={item.id}>
                  <span>
                    <b>
                      {item.quantity} × {item.productName}
                    </b>
                    {item.extras.length > 0 && (
                      <small>
                        {item.extras.map((extra) => extra.name).join("، ")}
                      </small>
                    )}
                  </span>
                  <strong>
                    {money(
                      (Number(item.unitPrice) +
                        item.extras.reduce(
                          (sum, extra) => sum + Number(extra.price),
                          0,
                        )) *
                        item.quantity,
                    )}
                  </strong>
                </div>
              ))}
              <div className="tracking-total">
                <span>{t("total")}</span>
                <strong>{money(Number(order.total))}</strong>
              </div>
            </article>
            <article className="order-card">
              <h2>{t("conversation")}</h2>
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
            </article>
          </div>
          <aside className="order-column">
            <article className="order-card order-details">
              <h2>{t("customer")}</h2>
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
              )}
              {order.notes && (
                <p>
                  <b>{t("notes")}:</b> {order.notes}
                </p>
              )}
              {isRestaurant && (
                <a
                  className="button whatsapp-button"
                  href={whatsappUrl(
                    order.customerPhone,
                    `${restaurantName} - ${order.orderNumber}`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle />
                  {t("contactCustomer")}
                </a>
              )}
            </article>
            {!order.customerUserId && !isRestaurant && (
              <article className="order-card">
                <h2>{t("createAccount")}</h2>
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
              </article>
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
