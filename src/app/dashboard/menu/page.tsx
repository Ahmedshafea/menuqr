import Link from "next/link";
import { Eye, FileText, Pencil, Plus } from "lucide-react";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import {
  uploadRestaurantImage,
  deleteRestaurantImage,
} from "@/lib/supabase/storage";
import { CloseDetailsButton } from "@/components/close-details-button";
import { ProductImportDialog } from "@/components/product-import-dialog";
import { DeleteProductButton } from "@/components/delete-product-button";
import { ProductOptionsEditor } from "@/components/product-options-editor";
import { parseProductOptions, syncProductOptions } from "@/lib/product-options";
import { FormWizard } from "@/components/form-wizard";
import { DashboardDisclosure, RecordDisclosure } from "@/components/dashboard-disclosure";

export const dynamic = "force-dynamic";

export default async function MenuManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; result?: string; page?: string }>;
}) {
  const { restaurantId } = await requireTenant();
  const { q = "", result, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const take = 25;
  const [
    menuText,
    toolsText,
    productText,
    formOptionsText,
    ux,
    common,
    locale,
    restaurant,
    categories,
    products,
    totalProducts,
    reusableOptions,
  ] = await Promise.all([
    getTranslations("menuAdmin"),
    getTranslations("productTools"),
    getTranslations("mvpPolish.products"),
    getTranslations("productFormOptions"),
    getTranslations("ux"),
    getTranslations("common"),
    getLocale(),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { slug: true, currency: true },
    }),
    prisma.category.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, nameAr: true },
    }),
    prisma.product.findMany({
      where: {
        restaurantId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { nameAr: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        extras: true,
        optionGroups:{orderBy:{sortOrder:"asc"},include:{group:{include:{options:{orderBy:{sortOrder:"asc"},include:{option:true}}}}}},
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      skip: (page - 1) * take,
      take,
    }),
    prisma.product.count({
      where: {
        restaurantId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { nameAr: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
    }),
    prisma.productOption.findMany({where:{restaurantId},orderBy:[{name:"asc"}],select:{id:true,name:true,nameAr:true,priceAdjustment:true}}),
  ]);
  const productToolKeys = new Set([
    "replaceImage",
    "updated",
    "edit",
    "editProduct",
    "saveChanges",
    "featured",
    "importProducts",
    "importDescription",
    "chooseFile",
    "startImport",
    "downloadXlsx",
    "downloadCsv",
    "importSuccess",
    "importError",
    "deleteConfirmation",
  ]);
  const t = (key: string) =>
    productToolKeys.has(key) ? toolsText(key as never) : menuText(key as never);

  async function createProduct(form: FormData) {
    "use server";
    const { restaurantId } = await requireTenant();
    const name = String(form.get("name") ?? "").trim();
    const nameAr = String(form.get("nameAr") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const descriptionAr = String(form.get("descriptionAr") ?? "").trim();
    const price = Number(form.get("price"));
    const stockText = String(form.get("stock") ?? "").trim();
    let categoryId = String(form.get("categoryId") ?? "");
    const newCategory = String(form.get("newCategory") ?? "").trim();
    const newCategoryAr = String(form.get("newCategoryAr") ?? "").trim();
    const imageFile = form.get("image");
    const productOptions = parseProductOptions(form.get("productOptions"));
    if (
      name.length < 2 ||
      !Number.isFinite(price) ||
      price < 0 ||
      (!categoryId && !newCategory && !newCategoryAr)
    )
      redirect("/dashboard/menu?result=invalid");
    const uploaded =
      imageFile instanceof File && imageFile.size > 0
        ? await uploadRestaurantImage({
            bucket: "product-images",
            restaurantId,
            file: imageFile,
          })
        : null;
    try {
      await prisma.$transaction(async (tx) => {
        if (categoryId) {
          if (
            !(await tx.category.findFirst({
              where: { id: categoryId, restaurantId },
              select: { id: true },
            }))
          )
            throw new Error("Invalid category");
        } else {
          const category = await tx.category.create({
            data: {
              restaurantId,
              name: newCategory || newCategoryAr,
              nameAr: newCategoryAr || null,
              sortOrder: await tx.category.count({ where: { restaurantId } }),
            },
          });
          categoryId = category.id;
        }
        const createdProduct = await tx.product.create({
          data: {
            restaurantId,
            categoryId,
            name,
            nameAr: nameAr || null,
            description: description || null,
            descriptionAr: descriptionAr || null,
            price,
            stock: stockText
              ? Math.max(0, Number.parseInt(stockText, 10) || 0)
              : null,
            isAvailable: form.get("isAvailable") === "on",
            availability: form.get("isAvailable") === "on" ? "AVAILABLE" : "HIDDEN",
            sortOrder: await tx.product.count({
              where: { restaurantId, categoryId },
            }),
            ...(uploaded
              ? {
                  images: {
                    create: {
                      url: uploaded.url,
                      publicId: uploaded.path,
                      alt: name,
                    },
                  },
                }
              : {}),
          },
        });
        await syncProductOptions(tx, restaurantId, createdProduct.id, productOptions);
      });
    } catch (error) {
      if (uploaded)
        await deleteRestaurantImage(
          "product-images",
          uploaded.path,
          restaurantId,
        );
      throw error;
    }
    revalidatePath("/dashboard/menu");
    revalidateTag("public-menu");
    revalidatePath(`/menu/${restaurant.slug}`);
    redirect("/dashboard/menu?result=created&toast=productCreated");
  }

  async function setAvailability(form: FormData) {
    "use server";
    const { restaurantId } = await requireTenant();
    const id = String(form.get("id"));
    const availability = String(form.get("availability"));
    if (!["AVAILABLE", "TEMPORARILY_UNAVAILABLE", "HIDDEN"].includes(availability)) return;
    await prisma.product.updateMany({
      where: { id, restaurantId },
      data: {
        availability: availability as "AVAILABLE" | "TEMPORARILY_UNAVAILABLE" | "HIDDEN",
        isAvailable: availability === "AVAILABLE",
      },
    });
    revalidatePath("/dashboard/menu");
    revalidatePath(`/menu/${restaurant.slug}`);
    revalidateTag("public-menu");
  }
  async function quickUpdate(form: FormData) {
    "use server";
    const { restaurantId } = await requireTenant();
    const id = String(form.get("id"));
    const categoryId = String(form.get("categoryId") || "");
    const price = Number(form.get("price"));
    const featured = form.get("featured");
    const data: { categoryId?: string; price?: number; isFeatured?: boolean } = {};
    if (categoryId && await prisma.category.findFirst({ where: { id: categoryId, restaurantId }, select: { id: true } })) data.categoryId = categoryId;
    if (Number.isFinite(price) && price >= 0) data.price = price;
    if (featured === "true" || featured === "false") data.isFeatured = featured === "true";
    if (Object.keys(data).length) await prisma.product.updateMany({ where: { id, restaurantId }, data });
    revalidatePath("/dashboard/menu");
    revalidateTag("public-menu");
  }
  async function duplicateProduct(form: FormData) {
    "use server";
    const { restaurantId } = await requireTenant();
    const source = await prisma.product.findFirst({
      where: { id: String(form.get("id")), restaurantId },
      select: { name: true, nameAr: true, description: true, descriptionAr: true, price: true, availability: true, isAvailable: true, isFeatured: true, stock: true, categoryId: true, images: { select: { url: true, publicId: true, alt: true, sortOrder: true } }, extras: { select: { name: true, nameAr: true, price: true, isAvailable: true } } },
    });
    if (!source) return;
    await prisma.product.create({
      data: {
        restaurantId,
        categoryId: source.categoryId,
        name: `${source.name} (Copy)`,
        nameAr: source.nameAr ? `${source.nameAr} (نسخة)` : null,
        description: source.description,
        descriptionAr: source.descriptionAr,
        price: source.price,
        availability: source.availability,
        isAvailable: source.isAvailable,
        isFeatured: false,
        stock: source.stock,
        images: { create: source.images.map((image) => ({ ...image, publicId: null })) },
        extras: { create: source.extras },
      },
    });
    revalidatePath("/dashboard/menu");
    revalidateTag("public-menu");
  }
  async function updateProduct(form: FormData) {
    "use server";
    const { restaurantId } = await requireTenant();
    const id = String(form.get("id") ?? "");
    const categoryId = String(form.get("categoryId") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const nameAr = String(form.get("nameAr") ?? "").trim();
    const price = Number(form.get("price"));
    const stockText = String(form.get("stock") ?? "").trim();
    const productOptions = parseProductOptions(form.get("productOptions"));
    const [product, category] = await Promise.all([
      prisma.product.findFirst({
        where: { id, restaurantId },
        select: {
          images: {
            where: { publicId: { not: null } },
            select: { publicId: true },
          },
        },
      }),
      prisma.category.findFirst({
        where: { id: categoryId, restaurantId },
        select: { id: true },
      }),
    ]);
    if (
      !product ||
      !category ||
      name.length < 2 ||
      !Number.isFinite(price) ||
      price < 0
    )
      redirect("/dashboard/menu?result=invalid");
    const imageFile = form.get("image");
    const uploaded =
      imageFile instanceof File && imageFile.size > 0
        ? await uploadRestaurantImage({
            bucket: "product-images",
            restaurantId,
            file: imageFile,
          })
        : null;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id },
          data: {
            categoryId,
            name,
            nameAr: nameAr || null,
            description: String(form.get("description") ?? "").trim() || null,
            descriptionAr:
              String(form.get("descriptionAr") ?? "").trim() || null,
            price,
            stock: stockText
              ? Math.max(0, Number.parseInt(stockText, 10) || 0)
              : null,
            isAvailable: form.get("isAvailable") === "on",
            availability:
              form.get("isAvailable") === "on" ? "AVAILABLE" : "HIDDEN",
            isFeatured: form.get("isFeatured") === "on",
            ...(uploaded
              ? {
                  images: {
                    deleteMany: {},
                    create: {
                      url: uploaded.url,
                      publicId: uploaded.path,
                      alt: name,
                    },
                  },
                }
              : {}),
          },
        });
        await syncProductOptions(tx, restaurantId, id, productOptions);
      });
      if (uploaded)
        await Promise.all(
          product.images.flatMap((image) =>
            image.publicId
              ? [
                  deleteRestaurantImage(
                    "product-images",
                    image.publicId,
                    restaurantId,
                  ),
                ]
              : [],
          ),
        );
    } catch (error) {
      if (uploaded)
        await deleteRestaurantImage(
          "product-images",
          uploaded.path,
          restaurantId,
        );
      throw error;
    }
    revalidatePath("/dashboard/menu");
    revalidatePath(`/menu/${restaurant.slug}`);
    revalidateTag("public-menu");
    redirect("/dashboard/menu?result=updated&toast=productUpdated");
  }
  async function deleteProduct(form: FormData) {
    "use server";
    const { restaurantId } = await requireTenant();
    const id = String(form.get("id"));
    const product = await prisma.product.findFirst({
      where: { id, restaurantId },
      select: {
        images: {
          where: { publicId: { not: null } },
          select: { publicId: true },
        },
      },
    });
    if (product) {
      await prisma.product.delete({ where: { id } });
      await Promise.all(
        product.images.flatMap((image) =>
          image.publicId
            ? [
                deleteRestaurantImage(
                  "product-images",
                  image.publicId,
                  restaurantId,
                ),
              ]
            : [],
        ),
      );
    }
    revalidatePath("/dashboard/menu");
    revalidatePath(`/menu/${restaurant.slug}`);
    revalidateTag("public-menu");
    redirect("/dashboard/menu?toast=productDeleted");
  }

  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: restaurant.currency,
    }).format(value);
  const fields = (product?: (typeof products)[number]) => (
    <FormWizard
      stepTitles={[ux("productBasics"), ux("productPricing"), ux("productDetails"), formOptionsText("title"), ux("review")]}
      previousLabel={ux("previous")}
      nextLabel={ux("next")}
      finishLabel={product ? t("saveChanges") : t("createProduct")}
    >
      <section>
      <label>
        {t("nameEn")}
        <input
          name="name"
          defaultValue={product?.name}
          required
          minLength={2}
        />
      </label>
      <label>
        {t("nameAr")}
        <input name="nameAr" defaultValue={product?.nameAr ?? ""} dir="rtl" />
      </label>
      <label className="full">
        {product ? toolsText("replaceImage") : t("productImage")}
        <input
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
        />
      </label>
      {product ? (
        <label>
          {t("category")}
          <select name="categoryId" defaultValue={product.categoryId}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {locale === "ar" && category.nameAr ? category.nameAr : category.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          {categories.length > 0 && (
            <label>
              {t("category")}
              <select name="categoryId" defaultValue="">
                <option value="">{t("newCategoryOption")}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {locale === "ar" && category.nameAr ? category.nameAr : category.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>{t("newCategory")}<input name="newCategory" /></label>
          <label>{t("newCategoryAr")}<input name="newCategoryAr" dir="rtl" /></label>
        </>
      )}
      </section>
      <section>
      <label>
        {t("price")}
        <input name="price" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={product ? Number(product.price) : undefined} required />
      </label>
      <label>
        {t("stock")}
        <input name="stock" type="number" inputMode="numeric" min="0" defaultValue={product?.stock ?? ""} />
      </label>
      <label className="check-label">
        <input name="isAvailable" type="checkbox" defaultChecked={product?.isAvailable ?? true} />
        {common("available")}
      </label>
      {product && <label className="check-label"><input name="isFeatured" type="checkbox" defaultChecked={product.isFeatured} />{toolsText("featured")}</label>}
      </section>
      <section>
      <label className="full">
        {t("descriptionEn")}
        <textarea
          name="description"
          defaultValue={product?.description ?? ""}
        />
      </label>
      <label className="full">
        {t("descriptionAr")}
        <textarea
          name="descriptionAr"
          defaultValue={product?.descriptionAr ?? ""}
          dir="rtl"
        />
      </label>
      </section>
      <section>
      <ProductOptionsEditor
        existingOptions={reusableOptions.map((option) => ({
          id: option.id,
          name: option.name,
          nameAr: option.nameAr,
          price: Number(option.priceAdjustment),
        }))}
        initialGroups={
          product?.optionGroups.map(({ group }) => ({
            id: group.id,
            name: group.name,
            nameAr: group.nameAr ?? undefined,
            required: group.isRequired,
            min: group.minSelections,
            max: group.maxSelections,
            options: group.options.map(({ option }) => ({
              id: option.id,
              name: option.name,
              nameAr: option.nameAr ?? undefined,
              price: Number(option.priceAdjustment),
            })),
          })) ?? []
        }
        labels={{
          title: formOptionsText("title"),
          help: formOptionsText("help"),
          addGroup: formOptionsText("addGroup"),
          groupName: formOptionsText("groupName"),
          groupNameAr: formOptionsText("groupNameAr"),
          required: formOptionsText("required"),
          optional: formOptionsText("optional"),
          min: formOptionsText("min"),
          max: formOptionsText("max"),
          addOption: formOptionsText("addOption"),
          createNew: formOptionsText("createNew"),
          selectExisting: formOptionsText("selectExisting"),
          optionName: formOptionsText("optionName"),
          optionNameAr: formOptionsText("optionNameAr"),
          price: formOptionsText("price"),
          free: formOptionsText("free"),
          remove: formOptionsText("remove"),
        }}
      />
      </section>
      <section>
        <div className="product-review-card">
          <strong>{product?.name || ux("newProduct")}</strong>
          <p>{ux("reviewHelp")}</p>
        </div>
      </section>
    </FormWizard>
  );
  return (
    <section className="dash-main">
      <header>
        <div>
          <small>{t("products")}</small>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <div className="menu-header-actions">
          <Link className="button ghost" href="/dashboard/menu/import-pdf">
            <FileText />
            {toolsText("importPdf")}
          </Link>
          <ProductImportDialog
            labels={{
              title: t("importProducts"),
              description: t("importDescription"),
              choose: t("chooseFile"),
              upload: t("startImport"),
              templateXlsx: t("downloadXlsx"),
              templateCsv: t("downloadCsv"),
              // The client fills these placeholders after the import response.
              // Use raw() so next-intl does not try to format them on the server.
              success: toolsText.raw("importSuccess"),
              error: t("importError"),
              close: common("close"),
              requirementsTitle: toolsText("requirementsTitle"),
              requirementsDescription: toolsText("requirementsDescription"),
              productNameRequired: toolsText("productNameRequired"),
              categoryRequired: toolsText("categoryRequired"),
              priceRequired: toolsText("priceRequired"),
              imageOptional: toolsText("imageOptional"),
              ifImageProvided: toolsText("ifImageProvided"),
              httpsOnly: toolsText("httpsOnly"),
              directImage: toolsText("directImage"),
              supportedFormats: toolsText("supportedFormats"),
              recommendedSize: toolsText("recommendedSize"),
              maximumSize: toolsText("maximumSize"),
              notSupported: toolsText("notSupported"),
              googleDrive: toolsText("googleDrive"),
              googlePhotos: toolsText("googlePhotos"),
              dropbox: toolsText("dropbox"),
              oneDrive: toolsText("oneDrive"),
              htmlPages: toolsText("htmlPages"),
              tipTitle: toolsText("tipTitle"),
              tipText: toolsText("tipText"),
              invalidImage: toolsText("invalidImage"),
              invalidDirectImage: toolsText("invalidDirectImage"),
              imageTooLarge: toolsText("imageTooLarge"),
              rowError: toolsText.raw("rowError"),
              productNameError: toolsText("productNameError"),
              categoryError: toolsText("categoryError"),
              priceError: toolsText("priceError"),
              stockError: toolsText("stockError"),
              booleanError: toolsText("booleanError"),
              invalidRow: toolsText("invalidRow"),
            }}
          />
          <details className="product-create">
            <summary className="button primary">
              <Plus />
              {t("addProduct")}
            </summary>
            <div className="product-form-panel">
              <CloseDetailsButton />
              <h2>{t("addProduct")}</h2>
              <form action={createProduct} className="settings-grid">
                {fields()}
              </form>
            </div>
          </details>
        </div>
      </header>
      {result === "created" && <p className="form-success">{t("created")}</p>}
      {result === "updated" && <p className="form-success">{t("updated")}</p>}
      {result === "invalid" && <p className="form-error">{t("invalid")}</p>}
      <DashboardDisclosure title={t("products")} summary={totalProducts} className="management-card">
        <div className="management-toolbar">
          <form className="dashboard-search">
            <input name="q" defaultValue={q} placeholder={t("search")} />
          </form>
          <Link href={`/menu/${restaurant.slug}`} className="button ghost">
            <Eye />
            {t("preview")}
          </Link>
        </div>
        {products.length ? (
          <>
          <div className="mobile-record-list">
            {products.map((product) => (
              <RecordDisclosure key={product.id} title={locale === "ar" && product.nameAr ? product.nameAr : product.name} meta={money(Number(product.price))}>
                <p><b>{t("category")}</b><span>{locale === "ar" && product.category.nameAr ? product.category.nameAr : product.category.name}</span></p>
                <p><b>{t("stock")}</b><span>{product.stock ?? "—"}</span></p>
                <p><b>{t("availability")}</b><span>{productText(product.availability === "AVAILABLE" ? "available" : product.availability === "HIDDEN" ? "hidden" : "temporary")}</span></p>
                <div className="row-actions">
                  <details className="product-create edit-product"><summary className="button ghost">{t("edit")}</summary><div className="product-form-panel"><CloseDetailsButton/><h2>{t("editProduct")}</h2><form action={updateProduct} className="settings-grid"><input type="hidden" name="id" value={product.id}/>{fields(product)}</form></div></details>
                  <DeleteProductButton id={product.id} action={deleteProduct} label={t("delete")} confirmation={t("deleteConfirmation")}/>
                </div>
              </RecordDisclosure>
            ))}
          </div>
          <table className="w-full">
            <thead className="hidden md:table-header-group">
              <tr>
                <th>{t("product")}</th>
                <th className="hidden lg:table-cell">{t("category")}</th>
                <th>{t("price")}</th>
                <th className="hidden xl:table-cell">{t("stock")}</th>
                <th>{t("availability")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {products.map((product) => (
                <tr key={product.id} className="block md:table-row border md:border-0 rounded-xl mb-4 p-4 md:p-0 bg-white md:bg-transparent">
                  <td className="block md:table-cell py-2 md:py-4" data-label={t("product")}>
                    <strong>
                      {locale === "ar" && product.nameAr
                        ? product.nameAr
                        : product.name}
                    </strong>
                  </td>
                  <td className="block md:table-cell py-2 md:py-4 lg:table-cell" data-label={t("category")}>
                    {locale === "ar" && product.category.nameAr
                      ? product.category.nameAr
                      : product.category.name}
                  </td>
                  <td className="block md:table-cell py-2 md:py-4" data-label={t("price")}>{money(Number(product.price))}</td>
                  <td className="block md:table-cell py-2 md:py-4 xl:table-cell" data-label={t("stock")}>{product.stock ?? "—"}</td>
                  <td className="block md:table-cell py-2 md:py-4" data-label={t("availability")}>
                    <form action={setAvailability} className="quick-availability">
                      <input type="hidden" name="id" value={product.id} />
                      <select name="availability" defaultValue={product.availability} className="w-full md:w-auto">
                        <option value="AVAILABLE">{productText("available")}</option>
                        <option value="TEMPORARILY_UNAVAILABLE">{productText("temporary")}</option>
                        <option value="HIDDEN">{productText("hidden")}</option>
                      </select>
                      <button aria-label={productText("save")} className="hidden md:flex">✓</button>
                    </form>
                  </td>
                  <td className="block md:table-cell py-2 md:py-4" data-label={t("actions")}>
                    <div className="row-actions flex items-center gap-2 justify-end md:justify-start">
                      <details className="product-create edit-product">
                        <summary className="icon-edit" aria-label={t("edit")}>
                          <Pencil />
                        </summary>
                        <div className="product-form-panel">
                          <CloseDetailsButton />
                          <h2>{t("editProduct")}</h2>
                          <form
                            action={updateProduct}
                            className="settings-grid"
                          >
                            <input type="hidden" name="id" value={product.id} />
                            {fields(product)}
                          </form>
                        </div>
                      </details>
                      <DeleteProductButton
                        id={product.id}
                        action={deleteProduct}
                        label={t("delete")}
                        confirmation={t("deleteConfirmation")}
                      />
                      <details className="quick-actions">
                        <summary>•••</summary>
                        <div>
                          <form action={duplicateProduct}><input type="hidden" name="id" value={product.id}/><button>{productText("duplicate")}</button></form>
                          <form action={quickUpdate}>
                            <input type="hidden" name="id" value={product.id}/>
                            <input type="hidden" name="featured" value={String(!product.isFeatured)}/>
                            <button>{product.isFeatured ? productText("notFeatured") : productText("featured")}</button>
                          </form>
                          <form action={quickUpdate}>
                            <input type="hidden" name="id" value={product.id}/>
                            <select name="categoryId" defaultValue={product.categoryId}>{categories.map((category)=><option key={category.id} value={category.id}>{locale==="ar"&&category.nameAr?category.nameAr:category.name}</option>)}</select>
                            <button>{productText("move")}</button>
                          </form>
                          <form action={quickUpdate}>
                            <input type="hidden" name="id" value={product.id}/>
                            <input name="price" type="number" min="0" step=".01" defaultValue={Number(product.price)} aria-label={productText("price")}/>
                            <button>{productText("save")}</button>
                          </form>
                        </div>
                      </details>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></>
        ) : (
          <div className="friendly-empty">
            <Plus />
            <h2>{productText("emptyTitle")}</h2>
            <p>{productText("emptyHelp")}</p>
          </div>
        )}
        <div className="pagination">
          {page > 1 && (
            <Link href={`?q=${encodeURIComponent(q)}&page=${page - 1}`}>
              {common("previous")}
            </Link>
          )}
          <span>
            {page} / {Math.max(1, Math.ceil(totalProducts / take))}
          </span>
          {page * take < totalProducts && (
            <Link href={`?q=${encodeURIComponent(q)}&page=${page + 1}`}>
              {common("next")}
            </Link>
          )}
        </div>
      </DashboardDisclosure>
    </section>
  );
}
