import { hash } from "bcryptjs";
import { notFound } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
import { jsonForAudit } from "@/lib/platform-config";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const roles = ["SUPER_ADMIN", "RESTAURANT_OWNER", "STAFF", "CUSTOMER"] as const;

async function updateAccount(data: FormData) {
  "use server"; const session = await requireSuperAdmin();
  const parsed = z.object({ id: z.string().cuid(), name: z.string().trim().min(2).max(120), email: z.string().email(), phone: z.string().trim().max(30).optional(), language: z.enum(["ar", "en"]), isActive: z.boolean(), roles: z.array(z.enum(roles)) }).parse({ id: data.get("id"), name: data.get("name"), email: data.get("email"), phone: String(data.get("phone") || "") || undefined, language: data.get("language"), isActive: data.get("isActive") === "on", roles: roles.filter((role) => data.get(`role_${role}`) === "on") });
  if (parsed.id === session.user.id && (!parsed.isActive || !parsed.roles.includes("SUPER_ADMIN"))) throw new Error("CANNOT_REMOVE_YOUR_OWN_ADMIN_ACCESS");
  const previous = await prisma.user.findUniqueOrThrow({ where: { id: parsed.id }, select: { name: true, email: true, phone: true, language: true, isActive: true, roles: { select: { role: true } } } });
  await prisma.$transaction(async (tx) => { await tx.user.update({ where: { id: parsed.id }, data: { name: parsed.name, email: parsed.email.toLowerCase(), phone: parsed.phone, language: parsed.language, isActive: parsed.isActive } }); await tx.userRole.deleteMany({ where: { userId: parsed.id, role: { notIn: parsed.roles } } }); for (const role of parsed.roles) await tx.userRole.upsert({ where: { userId_role: { userId: parsed.id, role } }, create: { userId: parsed.id, role }, update: {} }); await tx.auditLog.create({ data: { action: "USER_ACCOUNT_UPDATED", entity: "User", entityId: parsed.id, userId: session.user.id, metadata: jsonForAudit({ previous, next: parsed }) } }); });
  revalidatePath(`/super-admin/users/${parsed.id}`); revalidatePath("/super-admin/users");
  revalidateTag("user-access");
}

async function setTemporaryPassword(data: FormData) {
  "use server"; const session = await requireSuperAdmin(); const parsed = z.object({ id: z.string().cuid(), password: z.string().min(10).max(128).regex(/[A-Z]/).regex(/[0-9]/) }).parse({ id: data.get("id"), password: data.get("password") }); const passwordHash = await hash(parsed.password, 12);
  await prisma.$transaction([prisma.user.update({ where: { id: parsed.id }, data: { passwordHash, sessionVersion: { increment: 1 } } }), prisma.passwordResetToken.deleteMany({ where: { userId: parsed.id } }), prisma.auditLog.create({ data: { action: "USER_PASSWORD_RESET_BY_ADMIN", entity: "User", entityId: parsed.id, userId: session.user.id, metadata: { passwordLogged: false } } })]); revalidateTag("user-access"); revalidatePath(`/super-admin/users/${parsed.id}`);
}

export default async function UserDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const user = await prisma.user.findUnique({ where: { id }, include: { roles: true, restaurantMemberships: { include: { restaurant: { select: { id: true, name: true, slug: true, isActive: true } } } }, customerProfile: { include: { _count: { select: { addresses: true } } } }, _count: { select: { customerOrders: true } } } }); if (!user) notFound(); const currentRoles = new Set(user.roles.map((item) => item.role));
  return <><header className="admin-header"><div><h1>{user.name}</h1><p>{user.email} · أُنشئ {new Intl.DateTimeFormat("ar-EG").format(user.createdAt)}</p></div></header><div className="admin-grid"><section className="admin-card"><h2>إعدادات الحساب</h2><form action={updateAccount} className="admin-form"><input type="hidden" name="id" value={user.id}/><label>الاسم<input name="name" defaultValue={user.name} required/></label><label>البريد<input type="email" name="email" defaultValue={user.email} required/></label><label>الهاتف<input name="phone" defaultValue={user.phone ?? ""}/></label><label>اللغة<select name="language" defaultValue={user.language}><option value="ar">العربية</option><option value="en">English</option></select></label><label className="admin-check full"><input type="checkbox" name="isActive" defaultChecked={user.isActive}/>الحساب نشط</label><div className="full"><b>الأدوار والصلاحيات</b>{roles.map((role) => <label className="admin-check" key={role}><input type="checkbox" name={`role_${role}`} defaultChecked={currentRoles.has(role)}/>{role}</label>)}</div><button>حفظ الحساب</button></form></section><section className="admin-card"><h2>مساعدة تسجيل الدخول</h2><p>عيّن كلمة مرور مؤقتة ثم أرسلها للمستخدم عبر قناة آمنة. لا يتم تسجيلها في السجلات.</p><form action={setTemporaryPassword} className="admin-form"><input type="hidden" name="id" value={user.id}/><label className="full">كلمة مرور مؤقتة<input type="password" name="password" minLength={10} required/></label><ConfirmSubmitButton className="admin-button" message="سيتم تغيير كلمة مرور المستخدم فورًا. متابعة؟">تغيير كلمة المرور</ConfirmSubmitButton></form><p>طلبات العميل: {user._count.customerOrders} · العناوين: {user.customerProfile?._count.addresses ?? 0}</p></section></div><section className="admin-card admin-section"><h2>المطاعم المرتبطة</h2>{user.restaurantMemberships.length ? user.restaurantMemberships.map((membership) => <p key={membership.id}><a href={`/super-admin/restaurants/${membership.restaurant.id}`}>{membership.restaurant.name}</a> — {membership.role} — {membership.restaurant.isActive ? "نشط" : "موقوف"}</p>) : <p>لا توجد مطاعم مرتبطة.</p>}</section></>;
}
