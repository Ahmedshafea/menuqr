import { headers } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import type { Prisma } from "@prisma/client";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
import { featureFlagInput, homepageSectionInput, parseConfigValue, platformSettingInput } from "@/lib/platform-config-validation";
import { HOMEPAGE_CONFIG_TAG, PLATFORM_CONFIG_TAG, PLATFORM_FLAGS_TAG, jsonForAudit } from "@/lib/platform-config";

const text = (data: FormData, key: string) => String(data.get(key) ?? "");
const optional = (data: FormData, key: string) => text(data, key).trim() || undefined;

async function requestMetadata() {
  const requestHeaders = await headers();
  return { ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim(), browser: requestHeaders.get("user-agent")?.slice(0, 500) };
}

async function saveSetting(data: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const parsed = platformSettingInput.parse({ namespace: text(data, "namespace"), key: text(data, "key"), label: text(data, "label"), labelAr: optional(data, "labelAr"), description: optional(data, "description"), valueType: text(data, "valueType"), visibility: text(data, "visibility"), rawValue: text(data, "rawValue") });
  const value = parseConfigValue(parsed.valueType, parsed.rawValue);
  if (value === null || value === undefined) throw new Error("CONFIG_VALUE_CANNOT_BE_NULL");
  const existing = await prisma.platformSetting.findUnique({ where: { namespace_key: { namespace: parsed.namespace, key: parsed.key } } });
  const metadata = await requestMetadata();
  await prisma.$transaction(async (tx) => {
    const saved = await tx.platformSetting.upsert({
      where: { namespace_key: { namespace: parsed.namespace, key: parsed.key } },
      create: { namespace: parsed.namespace, key: parsed.key, label: parsed.label, labelAr: parsed.labelAr, description: parsed.description, valueType: parsed.valueType, visibility: parsed.visibility, value: jsonForAudit(value), defaultValue: jsonForAudit(value), updatedById: session.user.id },
      update: { label: parsed.label, labelAr: parsed.labelAr, description: parsed.description, valueType: parsed.valueType, visibility: parsed.visibility, value: jsonForAudit(value), updatedById: session.user.id },
    });
    await tx.auditLog.create({ data: { action: existing ? "PLATFORM_SETTING_UPDATED" : "PLATFORM_SETTING_CREATED", entity: "PlatformSetting", entityId: saved.id, userId: session.user.id, ipAddress: metadata.ipAddress, metadata: jsonForAudit({ browser: metadata.browser, namespace: parsed.namespace, key: parsed.key, previousValue: existing?.value ?? null, newValue: value }) } });
  });
  revalidateTag(PLATFORM_CONFIG_TAG); revalidatePath("/super-admin/configuration"); revalidatePath("/");
}

async function deleteSetting(data: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const id = text(data, "id");
  const existing = await prisma.platformSetting.findUniqueOrThrow({ where: { id } });
  const metadata = await requestMetadata();
  await prisma.$transaction([
    prisma.auditLog.create({ data: { action: "PLATFORM_SETTING_DELETED", entity: "PlatformSetting", entityId: id, userId: session.user.id, ipAddress: metadata.ipAddress, metadata: jsonForAudit({ browser: metadata.browser, namespace: existing.namespace, key: existing.key, previousValue: existing.value }) } }),
    prisma.platformSetting.delete({ where: { id } }),
  ]);
  revalidateTag(PLATFORM_CONFIG_TAG); revalidatePath("/super-admin/configuration"); revalidatePath("/");
}

async function saveFlag(data: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const parsed = featureFlagInput.parse({ key: text(data, "key"), name: text(data, "name"), nameAr: optional(data, "nameAr"), description: optional(data, "description"), enabled: data.get("enabled") === "on", rolloutPercentage: text(data, "rolloutPercentage"), startsAt: optional(data, "startsAt"), endsAt: optional(data, "endsAt") });
  const startsAt = parsed.startsAt ? new Date(parsed.startsAt) : null;
  const endsAt = parsed.endsAt ? new Date(parsed.endsAt) : null;
  if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime())) || (startsAt && endsAt && startsAt >= endsAt)) throw new Error("INVALID_FLAG_SCHEDULE");
  const existing = await prisma.featureFlag.findUnique({ where: { key: parsed.key } });
  const metadata = await requestMetadata();
  await prisma.$transaction(async (tx) => {
    const saved = await tx.featureFlag.upsert({ where: { key: parsed.key }, create: { ...parsed, startsAt, endsAt, updatedById: session.user.id }, update: { ...parsed, startsAt, endsAt, updatedById: session.user.id } });
    await tx.auditLog.create({ data: { action: existing ? "FEATURE_FLAG_UPDATED" : "FEATURE_FLAG_CREATED", entity: "FeatureFlag", entityId: saved.id, userId: session.user.id, ipAddress: metadata.ipAddress, metadata: jsonForAudit({ browser: metadata.browser, key: parsed.key, previous: existing, next: saved }) } });
  });
  revalidateTag(PLATFORM_FLAGS_TAG); revalidatePath("/super-admin/configuration");
}

async function deleteFlag(data: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const id = text(data, "id");
  const existing = await prisma.featureFlag.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction([prisma.auditLog.create({ data: { action: "FEATURE_FLAG_DELETED", entity: "FeatureFlag", entityId: id, userId: session.user.id, metadata: jsonForAudit({ key: existing.key, previous: existing }) } }), prisma.featureFlag.delete({ where: { id } })]);
  revalidateTag(PLATFORM_FLAGS_TAG); revalidatePath("/super-admin/configuration");
}

async function saveHomepageSection(data: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const parsed = homepageSectionInput.parse({ key: text(data, "key"), name: text(data, "name"), nameAr: optional(data, "nameAr"), enabled: data.get("enabled") === "on", displayOrder: text(data, "displayOrder"), content: text(data, "content") });
  const content = JSON.parse(parsed.content) as Prisma.InputJsonValue;
  if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("HOMEPAGE_CONTENT_MUST_BE_OBJECT");
  const existing = await prisma.homepageSection.findUnique({ where: { key: parsed.key } });
  await prisma.$transaction(async (tx) => {
    const saved = await tx.homepageSection.upsert({ where: { key: parsed.key }, create: { ...parsed, content, updatedById: session.user.id }, update: { ...parsed, content, updatedById: session.user.id } });
    await tx.auditLog.create({ data: { action: existing ? "HOMEPAGE_SECTION_UPDATED" : "HOMEPAGE_SECTION_CREATED", entity: "HomepageSection", entityId: saved.id, userId: session.user.id, metadata: jsonForAudit({ key: parsed.key, previous: existing?.content ?? null, next: content }) } });
  });
  revalidateTag(HOMEPAGE_CONFIG_TAG); revalidatePath("/super-admin/configuration"); revalidatePath("/");
}

function jsonValue(value: unknown) { return typeof value === "string" ? value : JSON.stringify(value, null, 2); }
function localDate(value: Date | null) { if (!value) return ""; const copy = new Date(value.getTime() - value.getTimezoneOffset() * 60_000); return copy.toISOString().slice(0, 16); }

export default async function ConfigurationPage() {
  const [settings, flags, sections] = await Promise.all([
    prisma.platformSetting.findMany({ orderBy: [{ namespace: "asc" }, { key: "asc" }] }),
    prisma.featureFlag.findMany({ orderBy: { key: "asc" } }),
    prisma.homepageSection.findMany({ orderBy: { displayOrder: "asc" } }),
  ]);
  return <>
    <header className="admin-header"><div><h1>Dynamic Configuration Engine</h1><p>غيّر إعدادات المنصة والمزايا ومحتوى الصفحة الرئيسية دون إعادة نشر التطبيق.</p></div></header>
    <aside className="admin-notice">يتم تحديث الكاش فور الحفظ. مفاتيح API وكلمات المرور لا تُدار هنا ولا تظهر في الواجهة؛ تبقى داخل متغيرات Vercel المشفرة.</aside>

    <section className="admin-section"><header><h2>إعدادات المنصة</h2><span className="admin-pill">Cache: 60 ثانية</span></header>
      <div className="admin-grid">{settings.map((setting) => <article className="admin-card config-card" key={setting.id}><header><div><h3>{setting.labelAr || setting.label}</h3><p><code className="admin-code">{setting.namespace}.{setting.key}</code></p></div><span className="admin-pill">{setting.visibility}</span></header>
        <form action={saveSetting} className="admin-form"><input type="hidden" name="namespace" value={setting.namespace}/><input type="hidden" name="key" value={setting.key}/><input type="hidden" name="valueType" value={setting.valueType}/><input type="hidden" name="visibility" value={setting.visibility}/><input type="hidden" name="label" value={setting.label}/><input type="hidden" name="labelAr" value={setting.labelAr ?? ""}/><input type="hidden" name="description" value={setting.description ?? ""}/>
          {setting.valueType === "BOOLEAN" ? <label className="full">القيمة<select name="rawValue" defaultValue={String(setting.value)}><option value="true">مفعّل</option><option value="false">متوقف</option></select></label> : <label className="full">القيمة{setting.valueType === "JSON" ? <textarea className="admin-json" name="rawValue" defaultValue={jsonValue(setting.value)}/> : <input name="rawValue" type={setting.valueType === "NUMBER" ? "number" : "text"} defaultValue={jsonValue(setting.value)}/>}</label>}
          <button type="submit">حفظ التعديل</button>
        </form><form action={deleteSetting}><input type="hidden" name="id" value={setting.id}/><ConfirmSubmitButton message="سيتم حذف الإعداد نهائيًا. هل أنت متأكد؟">حذف</ConfirmSubmitButton></form>
      </article>)}</div>
      <details className="admin-card admin-section"><summary>إضافة إعداد جديد</summary><form action={saveSetting} className="admin-form">
        <label>المجموعة<input name="namespace" placeholder="orders" required/></label><label>المفتاح<input name="key" placeholder="expirationMinutes" required/></label><label>الاسم الإنجليزي<input name="label" required/></label><label>الاسم العربي<input name="labelAr"/></label><label>نوع القيمة<select name="valueType"><option>STRING</option><option>NUMBER</option><option>BOOLEAN</option><option>JSON</option></select></label><label>الظهور<select name="visibility"><option>PRIVATE</option><option>PUBLIC</option></select></label><label className="full">القيمة<textarea name="rawValue" required/></label><label className="full">الوصف<input name="description"/></label><button>إضافة الإعداد</button>
      </form></details>
    </section>

    <section className="admin-section" id="flags"><header><h2>Feature Flags</h2><span className="admin-pill">Cache: 30 ثانية</span></header><div className="admin-grid">{flags.map((flag) => <article className="admin-card config-card" key={flag.id}><header><div><h3>{flag.nameAr || flag.name}</h3><code className="admin-code">{flag.key}</code></div><span className={`admin-pill ${flag.enabled ? "" : "off"}`}>{flag.enabled ? "مفعلة" : "متوقفة"}</span></header><p>{flag.description}</p>
      <form action={saveFlag} className="admin-form"><input type="hidden" name="key" value={flag.key}/><input type="hidden" name="name" value={flag.name}/><input type="hidden" name="nameAr" value={flag.nameAr ?? ""}/><input type="hidden" name="description" value={flag.description ?? ""}/><label className="admin-check full"><input type="checkbox" name="enabled" defaultChecked={flag.enabled}/>تفعيل الميزة</label><label>نسبة الإتاحة<input type="number" name="rolloutPercentage" min="0" max="100" defaultValue={flag.rolloutPercentage}/></label><label>بداية اختيارية<input type="datetime-local" name="startsAt" defaultValue={localDate(flag.startsAt)}/></label><label>نهاية اختيارية<input type="datetime-local" name="endsAt" defaultValue={localDate(flag.endsAt)}/></label><button>حفظ</button></form>
      <form action={deleteFlag}><input type="hidden" name="id" value={flag.id}/><ConfirmSubmitButton message="حذف مفتاح الميزة قد يؤثر على أجزاء من المنصة. متابعة؟">حذف</ConfirmSubmitButton></form></article>)}</div>
      <details className="admin-card admin-section"><summary>إضافة Feature Flag</summary><form action={saveFlag} className="admin-form"><label>المفتاح<input name="key" placeholder="NEW_FEATURE" required/></label><label>الاسم<input name="name" required/></label><label>الاسم العربي<input name="nameAr"/></label><label>نسبة الإتاحة<input name="rolloutPercentage" type="number" min="0" max="100" defaultValue="100"/></label><label className="admin-check full"><input type="checkbox" name="enabled"/>مفعلة</label><label className="full">الوصف<input name="description"/></label><button>إضافة</button></form></details>
    </section>

    <section className="admin-section"><header><h2>Homepage CMS</h2></header><div className="admin-grid">{sections.map((section) => <article className="admin-card config-card" key={section.id}><header><div><h3>{section.nameAr || section.name}</h3><code className="admin-code">{section.key}</code></div><span className={`admin-pill ${section.enabled ? "" : "off"}`}>{section.enabled ? "ظاهر" : "مخفي"}</span></header><form action={saveHomepageSection} className="admin-form"><input type="hidden" name="key" value={section.key}/><label>الاسم<input name="name" defaultValue={section.name} required/></label><label>الاسم العربي<input name="nameAr" defaultValue={section.nameAr ?? ""}/></label><label>الترتيب<input type="number" name="displayOrder" defaultValue={section.displayOrder}/></label><label className="admin-check"><input type="checkbox" name="enabled" defaultChecked={section.enabled}/>إظهار القسم</label><label className="full">المحتوى العربي والإنجليزي (JSON)<textarea className="admin-json" name="content" defaultValue={JSON.stringify(section.content, null, 2)} required/></label><button>حفظ القسم</button></form></article>)}</div>
      <details className="admin-card admin-section"><summary>إضافة قسم للصفحة الرئيسية</summary><form action={saveHomepageSection} className="admin-form"><label>المفتاح<input name="key" required/></label><label>الاسم<input name="name" required/></label><label>الاسم العربي<input name="nameAr"/></label><label>الترتيب<input name="displayOrder" type="number" defaultValue="100"/></label><label className="admin-check"><input name="enabled" type="checkbox" defaultChecked/>ظاهر</label><label className="full">المحتوى JSON<textarea className="admin-json" name="content" defaultValue={'{"ar":{},"en":{}}'} required/></label><button>إضافة القسم</button></form></details>
    </section>
  </>;
}
