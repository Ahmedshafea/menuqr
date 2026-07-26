import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { uploadRestaurantImage } from "@/lib/supabase/storage";
import { UserPlus, Phone, Bike, Upload, User } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DriversPage() {
  const { restaurantId } = await requireTenant();
  const [t, drivers] = await Promise.all([
    getTranslations("restaurantWorkflow.delivery"),
    prisma.deliveryDriver.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  async function save(form: FormData) {
    "use server";
    const { restaurantId } = await requireTenant();
    const name = String(form.get("name") || "").trim();
    const phone = String(form.get("phone") || "").replace(/\D/g, "");
    if (name.length < 2 || phone.length < 8) return;
    const photo = form.get("photo");
    const uploaded =
      photo instanceof File && photo.size > 0
        ? await uploadRestaurantImage({
            bucket: "restaurant-logos",
            restaurantId,
            file: photo,
          })
        : null;
    await prisma.deliveryDriver.create({
      data: {
        restaurantId,
        name,
        phone,
        whatsapp:
          String(form.get("whatsapp") || "").replace(/\D/g, "") || null,
        photoUrl: uploaded?.url ?? null,
        vehicleType: String(form.get("vehicleType") || "").trim() || null,
      },
    });
    revalidatePath("/dashboard/drivers");
  }

  async function status(form: FormData) {
    "use server";
    const { restaurantId } = await requireTenant();
    const value = String(form.get("status"));
    if (!["AVAILABLE", "BUSY", "OFFLINE"].includes(value)) return;
    await prisma.deliveryDriver.updateMany({
      where: { id: String(form.get("id")), restaurantId },
      data: { status: value as "AVAILABLE" | "BUSY" | "OFFLINE" },
    });
    revalidatePath("/dashboard/drivers");
  }

  // خريطة ألوان وتسميات الحالات
  const statusStyles = {
    AVAILABLE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    BUSY: "bg-amber-50 text-amber-700 border-amber-200",
    OFFLINE: "bg-slate-50 text-slate-600 border-slate-200",
  };

  return (
    <section className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 dir-rtl">
      {/* Header Section */}
      <header className="border-b pb-4">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t("title")}</h1>
        <p className="text-slate-500 mt-1 text-sm">{t("subtitle")}</p>
      </header>

      {/* Add New Driver Form */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8">
        <div className="flex items-center gap-2 mb-6 text-slate-800">
          <UserPlus className="w-5 h-5 text-orange-600" />
          <h2 className="text-xl font-bold">{t("new")}</h2>
        </div>

        <form action={save} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block">
                {t("name")} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  name="name"
                  required
                  placeholder="مثال: أحمد علي"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                />
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block">
                {t("phone")} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  name="phone"
                  required
                  dir="ltr"
                  placeholder="0123456789"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm text-right"
                />
              </div>
            </div>

            {/* WhatsApp */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block">
                {t("whatsapp")}
              </label>
              <input
                name="whatsapp"
                dir="ltr"
                placeholder="0123456789"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm text-right"
              />
            </div>

            {/* Vehicle Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block">
                {t("vehicle")}
              </label>
              <input
                name="vehicleType"
                placeholder="مثال: موتوسيكل / سيارة"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
              />
            </div>

            {/* Photo Upload */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-700 block">
                {t("photo")}
              </label>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-all">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-6 h-6 text-slate-400 mb-2" />
                    <p className="text-xs text-slate-500">
                      اضغط لرفع صورة السائق (PNG, JPG, WEBP)
                    </p>
                  </div>
                  <input
                    name="photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button 
              type="submit" 
              className="w-full md:w-auto px-8 py-3 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-xl transition-all shadow-sm active:scale-[0.98] text-sm"
            >
              {t("new")}
            </button>
          </div>
        </form>
      </div>

      {/* Drivers List Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-800">قائمة السائقين</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {drivers.map((driver) => (
            <article 
              key={driver.id} 
              className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
            >
              <div className="flex items-start gap-4">
                {/* Photo or Default Avatar */}
                {driver.photoUrl ? (
                  <div 
                    className="w-16 h-16 rounded-2xl bg-cover bg-center border border-slate-100 flex-shrink-0"
                    style={{ backgroundImage: `url(${driver.photoUrl})` }}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">
                    <User className="w-8 h-8" />
                  </div>
                )}

                {/* Driver Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <h2 className="text-base font-bold text-slate-900 truncate">
                    {driver.name}
                  </h2>
                  
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Phone className="w-3.5 h-3.5" />
                    <span dir="ltr">{driver.phone}</span>
                  </div>

                  {driver.vehicleType && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Bike className="w-3.5 h-3.5" />
                      <span>{driver.vehicleType}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Update Form */}
              <form action={status} className="pt-3 border-t border-slate-100 flex items-center gap-2">
                <input type="hidden" name="id" value={driver.id} />
                <select
                  name="status"
                  defaultValue={driver.status}
                  className={`flex-1 text-xs font-semibold py-2 px-3 rounded-lg border focus:outline-none transition-colors ${
                    statusStyles[driver.status as keyof typeof statusStyles] || "bg-slate-50 border-slate-200"
                  }`}
                >
                  <option value="AVAILABLE">{t("available")}</option>
                  <option value="BUSY">{t("busy")}</option>
                  <option value="OFFLINE">{t("offline")}</option>
                </select>

                <button 
                  type="submit" 
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {t("status")}
                </button>
              </form>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}