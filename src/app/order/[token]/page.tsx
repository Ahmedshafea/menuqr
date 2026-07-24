import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { Gift, History, MessageCircle, Minus, Phone, Plus, RefreshCw, Store, Trash2, UserRound } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { whatsappUrl } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { recalculateOrder, requireManagedOrder } from "@/lib/order-management";
import { createRestaurantNotification } from "@/lib/restaurant-notifications";

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
  const [session, t, flow, deliveryText, reviewText, locale, order] = await Promise.all([
    auth(),
    getTranslations("orderTracking"),
    getTranslations("launchPolish.orders"),
    getTranslations("restaurantWorkflow.delivery"),
    getTranslations("restaurantWorkflow.reviews"),
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
            products: { where: { isAvailable: true }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true, price: true } },
            drivers:{orderBy:{name:"asc"},select:{id:true,name:true,status:true}},
          },
        },
        items: { select: { id: true, productName: true, unitPrice: true, quantity: true, notes: true, isComplimentary: true, extras: { select: { id: true, name: true, price: true } },options:{select:{id:true,name:true,price:true}} } },
        driver:{select:{id:true,name:true,phone:true,whatsapp:true,photoUrl:true,vehicleType:true,status:true}},
        review:{select:{id:true}},
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

  async function changeQuantity(form: FormData) {
    "use server";
    const { order, session } = await requireManagedOrder(token);
    const itemId = String(form.get("itemId") ?? "");
    const delta = Number(form.get("delta")) === -1 ? -1 : 1;
    await prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId: order.id }, select: { id: true, quantity: true, productName: true } });
      if (!item) return;
      const quantity = Math.max(1, item.quantity + delta);
      if (quantity === item.quantity) return;
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
      const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId: order.id }, select: { id: true, productName: true } });
      if (!item) return;
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
        tx.orderItem.findFirst({ where: { id: itemId, orderId: order.id }, select: { id: true, productName: true } }),
        tx.product.findFirst({ where: { id: productId, restaurantId: order.restaurantId, isAvailable: true }, select: { id: true, name: true, nameAr: true, price: true } }),
      ]);
      if (!item || !product) return;
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
  async function submitReview(form:FormData){"use server";const current=await prisma.order.findUnique({where:{accessToken:token},select:{id:true,restaurantId:true,customerUserId:true,status:true,review:{select:{id:true}}}});if(!current||current.status!=="COMPLETED"||current.review)return;const score=(key:string)=>Math.max(1,Math.min(5,Number(form.get(key))||0));const overall=score("overall");if(!overall)return;await prisma.$transaction(async tx=>{await tx.restaurantReview.create({data:{restaurantId:current.restaurantId,orderId:current.id,customerUserId:current.customerUserId,foodQuality:score("foodQuality"),deliverySpeed:score("deliverySpeed"),packaging:score("packaging"),overall,comment:String(form.get("comment")||"").trim().slice(0,1000)||null}});await createRestaurantNotification(tx,{restaurantId:current.restaurantId,type:"NEW_REVIEW",title:overall<=2?"Low customer rating":"New customer review",body:`${overall}/5`,href:"/dashboard/reviews",dedupeKey:`review:${current.id}`});if(overall<=2)await createRestaurantNotification(tx,{restaurantId:current.restaurantId,type:"LOW_RATING",title:"Low customer rating",body:`${overall}/5`,href:"/dashboard/reviews",dedupeKey:`low-review:${current.id}`})});revalidatePath(`/order/${token}`);}

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
            {flow(`statuses.${order.status}`)}
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
                    {item.options.length>0&&<small>{item.options.map(option=>option.name).join("، ")}</small>}
                    {item.notes && <small>{item.notes}</small>}
                  </span>
                  <strong>
                    {item.isComplimentary ? flow("complimentary") : money(Number(item.unitPrice) * item.quantity)}
                  </strong>
                  {isRestaurant && <div className="order-item-management">
                    <form action={changeQuantity}><input type="hidden" name="itemId" value={item.id}/><button name="delta" value="-1" title={flow("decrease")}><Minus /></button><button name="delta" value="1" title={flow("increase")}><Plus /></button></form>
                    <form action={removeItem}><input type="hidden" name="itemId" value={item.id}/><button className="danger-action" title={flow("remove")}><Trash2 /></button></form>
                    <form action={replaceItem} className="replace-item-form"><input type="hidden" name="itemId" value={item.id}/><select name="productId" aria-label={flow("replaceWith")}>{order.restaurant.products.map(product=><option value={product.id} key={product.id}>{locale==="ar"&&product.nameAr?product.nameAr:product.name}</option>)}</select><button title={flow("replace")}><RefreshCw /></button></form>
                    <form action={updateItemNotes} className="item-notes-form"><input type="hidden" name="itemId" value={item.id}/><input name="notes" defaultValue={item.notes??""} placeholder={flow("itemNotes")} maxLength={500}/><button>{flow("addNotes")}</button></form>
                  </div>}
                </div>
              ))}
              {isRestaurant && <form action={addComplimentary} className="complimentary-form"><select name="productId">{order.restaurant.products.map(product=><option value={product.id} key={product.id}>{locale==="ar"&&product.nameAr?product.nameAr:product.name}</option>)}</select><button className="button ghost"><Gift />{flow("complimentary")}</button></form>}
              <div className="tracking-total">
                <span>{t("total")}</span>
                <strong>{money(Number(order.total))}</strong>
              </div>
              {isRestaurant && <form action={sendApprovalRequest}><button className="button whatsapp-button approval-button"><MessageCircle />{flow("sendApproval")}</button></form>}
              {isRestaurant&&order.fulfillmentType==="DELIVERY"&&<form action={assignDriver} className="driver-assignment"><select name="driverId" defaultValue={order.driverId??""}><option value="">{deliveryText("assign")}</option>{order.restaurant.drivers.filter(driver=>driver.status!=="OFFLINE"||driver.id===order.driverId).map(driver=><option key={driver.id} value={driver.id}>{driver.name} · {deliveryText(driver.status.toLowerCase() as "available"|"busy"|"offline")}</option>)}</select><button className="button primary">{deliveryText("assign")}</button></form>}
            </article>
            {order.driver&&<article className="order-card driver-public-card">{order.driver.photoUrl&&<span style={{backgroundImage:`url(${order.driver.photoUrl})`}}/>}<div><h2>{order.driver.name}</h2><p>{order.driver.vehicleType}</p><a href={`tel:${order.driver.phone}`}>{order.driver.phone}</a>{order.driver.whatsapp&&<a className="button whatsapp-button" href={`https://wa.me/${order.driver.whatsapp}`}>{deliveryText("whatsapp")}</a>}{order.estimatedArrivalAt&&<small>{deliveryText("eta")}: {new Intl.DateTimeFormat(locale,{timeStyle:"short"}).format(order.estimatedArrivalAt)}</small>}</div></article>}
            {order.status==="COMPLETED"&&!order.review&&<article className="order-card"><h2>{reviewText("title")}</h2><form action={submitReview} className="review-form">{[["foodQuality","food"],["deliverySpeed","speed"],["packaging","packaging"],["overall","overall"]].map(([name,key])=><label key={name}>{reviewText(key as "food"|"speed"|"packaging"|"overall")}<select name={name} required defaultValue="5">{[5,4,3,2,1].map(value=><option key={value} value={value}>{"★".repeat(value)}</option>)}</select></label>)}<textarea name="comment" maxLength={1000} placeholder={reviewText("comment")}/><button className="button primary">{reviewText("submit")}</button></form></article>}
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
            <article className="order-card">
              <h2><History />{flow("timeline")}</h2>
              <div className="order-timeline">
                {order.statusHistory.map(entry=><div className={`timeline-entry status-${entry.status.toLowerCase()}`} key={entry.id}><i /><time>{new Intl.DateTimeFormat(locale,{hour:"2-digit",minute:"2-digit"}).format(entry.createdAt)}</time><strong>{flow(`statuses.${entry.status}`)}</strong></div>)}
              </div>
            </article>
            {isRestaurant && <article className="order-card"><h2>{flow("actionLog")}</h2><div className="order-action-log">{order.actionLogs.map(log=><div key={log.id}><span><b>{log.user?.name??restaurantName}</b>{flow.has(`actions.${log.action}`)?flow(`actions.${log.action}`):log.action}</span><time>{new Intl.DateTimeFormat(locale,{dateStyle:"short",timeStyle:"short"}).format(log.createdAt)}</time></div>)}</div></article>}
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
