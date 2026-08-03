import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
import { jsonForAudit } from "@/lib/platform-config";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const planSchema = z.object({
  id: z.string().cuid().optional(), code: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_]+$/), name: z.string().trim().min(2).max(80), nameAr: z.string().trim().max(80).optional(), description: z.string().trim().max(500).optional(), descriptionAr: z.string().trim().max(500).optional(), price: z.coerce.number().min(0).max(10_000_000), currency: z.string().trim().length(3).transform((value) => value.toUpperCase()), displayOrder: z.coerce.number().int().min(0), isActive: z.boolean(), isRecommended: z.boolean(),
});

async function savePlan(data: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const rawId = String(data.get("id") ?? "");
  const parsed = planSchema.parse({ id: rawId || undefined, code: data.get("code"), name: data.get("name"), nameAr: String(data.get("nameAr") || "") || undefined, description: String(data.get("description") || "") || undefined, descriptionAr: String(data.get("descriptionAr") || "") || undefined, price: data.get("price"), currency: data.get("currency"), displayOrder: data.get("displayOrder"), isActive: data.get("isActive") === "on", isRecommended: data.get("isRecommended") === "on" });
  const previous = parsed.id ? await prisma.plan.findUnique({ where: { id: parsed.id } }) : null;
  await prisma.$transaction(async (tx) => {
    const plan = parsed.id
      ? await tx.plan.update({ where: { id: parsed.id }, data: { code: parsed.code, name: parsed.name, nameAr: parsed.nameAr, description: parsed.description, descriptionAr: parsed.descriptionAr, price: parsed.price, currency: parsed.currency, displayOrder: parsed.displayOrder, isActive: parsed.isActive, isRecommended: parsed.isRecommended } })
      : await tx.plan.create({ data: { code: parsed.code, name: parsed.name, nameAr: parsed.nameAr, description: parsed.description, descriptionAr: parsed.descriptionAr, price: parsed.price, currency: parsed.currency, displayOrder: parsed.displayOrder, isActive: parsed.isActive, isRecommended: parsed.isRecommended, maxProducts: 0, maxBranches: 0, maxStaff: 0 } });
    await tx.auditLog.create({ data: { action: previous ? "PLAN_UPDATED" : "PLAN_CREATED", entity: "Plan", entityId: plan.id, userId: session.user.id, metadata: jsonForAudit({ previous, next: plan }) } });
  });
  revalidatePath("/super-admin/plans"); revalidatePath("/"); revalidatePath("/dashboard/subscription");
}

async function saveEntitlement(data: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const parsed = z.object({ planId: z.string().cuid(), featureId: z.string().cuid(), enabled: z.boolean(), value: z.union([z.coerce.number().int(), z.literal("")]) }).parse({ planId: data.get("planId"), featureId: data.get("featureId"), enabled: data.get("enabled") === "on", value: data.get("value") });
  const previous = await prisma.planFeature.findUnique({ where: { planId_featureId: { planId: parsed.planId, featureId: parsed.featureId } } });
  const saved = await prisma.planFeature.upsert({ where: { planId_featureId: { planId: parsed.planId, featureId: parsed.featureId } }, create: { planId: parsed.planId, featureId: parsed.featureId, enabled: parsed.enabled, value: parsed.value === "" ? null : parsed.value }, update: { enabled: parsed.enabled, value: parsed.value === "" ? null : parsed.value } });
  await prisma.auditLog.create({ data: { action: "PLAN_FEATURE_UPDATED", entity: "PlanFeature", entityId: `${parsed.planId}:${parsed.featureId}`, userId: session.user.id, metadata: jsonForAudit({ previous, next: saved }) } });
  revalidatePath("/super-admin/plans"); revalidatePath("/"); revalidatePath("/dashboard/subscription");
}

async function deletePlan(data: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const id = z.string().cuid().parse(data.get("id"));
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id }, include: { _count: { select: { subscriptions: true } } } });
  if (plan._count.subscriptions > 0) throw new Error("PLAN_HAS_SUBSCRIPTIONS_DISABLE_IT_INSTEAD");
  await prisma.$transaction([prisma.auditLog.create({ data: { action: "PLAN_DELETED", entity: "Plan", entityId: id, userId: session.user.id, metadata: jsonForAudit({ previous: plan }) } }), prisma.plan.delete({ where: { id } })]);
  revalidatePath("/super-admin/plans"); revalidatePath("/");
}

export default async function PlansAdminPage() {
  const [plans, features] = await Promise.all([prisma.plan.findMany({ orderBy: { displayOrder: "asc" }, include: { features: true, _count: { select: { subscriptions: true } } } }), prisma.feature.findMany({ orderBy: { displayOrder: "asc" } })]);
  return <><header className="admin-header"><div><h1>الخطط والمزايا</h1><p>الأسعار والحدود تُقرأ مباشرة من قاعدة البيانات وتنعكس على صفحة الأسعار وصلاحيات المطاعم.</p></div></header>
    <div className="admin-grid">{plans.map((plan) => <article className="admin-card config-card" key={plan.id}><header><div><h3>{plan.nameAr || plan.name}</h3><code className="admin-code">{plan.code}</code></div><span className={`admin-pill ${plan.isActive ? "" : "off"}`}>{plan.isActive ? "نشطة" : "معطلة"}</span></header>
      <form action={savePlan} className="admin-form"><input type="hidden" name="id" value={plan.id}/><label>Code<input name="code" defaultValue={plan.code} required/></label><label>الترتيب<input type="number" name="displayOrder" defaultValue={plan.displayOrder}/></label><label>الاسم<input name="name" defaultValue={plan.name}/></label><label>الاسم العربي<input name="nameAr" defaultValue={plan.nameAr ?? ""}/></label><label>السعر<input type="number" name="price" step="0.01" min="0" defaultValue={Number(plan.price)}/></label><label>العملة<input name="currency" defaultValue={plan.currency}/></label><label className="full">الوصف<input name="description" defaultValue={plan.description ?? ""}/></label><label className="full">الوصف العربي<input name="descriptionAr" defaultValue={plan.descriptionAr ?? ""}/></label><label className="admin-check"><input type="checkbox" name="isActive" defaultChecked={plan.isActive}/>نشطة</label><label className="admin-check"><input type="checkbox" name="isRecommended" defaultChecked={plan.isRecommended}/>موصى بها</label><button>حفظ الخطة</button></form>
      <details><summary>تخصيص المزايا والحدود</summary><div className="config-card">{features.map((feature) => { const mapping = plan.features.find((item) => item.featureId === feature.id); return <form action={saveEntitlement} className="admin-form admin-card" key={feature.id}><input type="hidden" name="planId" value={plan.id}/><input type="hidden" name="featureId" value={feature.id}/><strong className="full">{feature.nameAr || feature.name}</strong><label className="admin-check"><input type="checkbox" name="enabled" defaultChecked={mapping?.enabled ?? false}/>مفعلة</label>{feature.valueType === "NUMBER" && <label>الحد (-1 غير محدود)<input type="number" name="value" defaultValue={mapping?.value ?? ""}/></label>}<button>تحديث</button></form>; })}</div></details>
      <p>{plan._count.subscriptions} اشتراك</p><form action={deletePlan}><input type="hidden" name="id" value={plan.id}/><ConfirmSubmitButton message="لا يمكن التراجع عن حذف الخطة. هل أنت متأكد؟">حذف الخطة</ConfirmSubmitButton></form>
    </article>)}</div>
    <details className="admin-card admin-section"><summary>إنشاء خطة جديدة</summary><form action={savePlan} className="admin-form"><label>Code<input name="code" required/></label><label>الترتيب<input name="displayOrder" type="number" defaultValue="100"/></label><label>الاسم<input name="name" required/></label><label>الاسم العربي<input name="nameAr"/></label><label>السعر<input name="price" type="number" step="0.01" defaultValue="0"/></label><label>العملة<input name="currency" defaultValue="EGP"/></label><label className="full">الوصف<input name="description"/></label><label className="full">الوصف العربي<input name="descriptionAr"/></label><label className="admin-check"><input name="isActive" type="checkbox" defaultChecked/>نشطة</label><label className="admin-check"><input name="isRecommended" type="checkbox"/>موصى بها</label><button>إنشاء</button></form></details>
  </>;
}
