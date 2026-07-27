export type DemoRestaurant = {
  id: string;
  isDemo: true;
  name: string;
  nameAr: string;
  slug: string;
  description: string;
  descriptionAr: string;
  whatsapp: string;
  logoUrl: string;
  coverUrl: string;
  currency: "EGP";
  locale: "ar";
  isActive: true;
  address: string;
  mapUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  facebookUrl: null;
  instagramUrl: null;
  settings: {
    allowOrdering: true;
    allowOrdersOutsideHours: true;
    estimatedOrderMinutes: number;
    offersDelivery?: boolean;
    offersPickup?: boolean;
    offersDineIn?: boolean;
    deliveryFee?: number;
    deliveryFeeType?: string;
    serviceFee?: number;
    serviceFeeType?: string;
    taxRate?: number;
    taxType?: string;
    discountValue?: number;
    discountType?: string;
  };
  branches: {
    address: string;
    workingHours: {
      dayOfWeek: number;
      opensAt: string;
      closesAt: string;
      isClosed: false;
    }[];
  }[];
  products: DemoProduct[];
};

export type DemoProduct = {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  price: number;
  availability: "AVAILABLE";
  isAvailable: true;
  isFeatured: boolean;
  stock: null;
  sortOrder: number;
  category: { name: string; nameAr: string; sortOrder: number };
  images: { id: string; url: string; sortOrder: number }[];
  extras: { id: string; name: string; nameAr: string; price: number; isAvailable: true }[];
};

const image = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=76`;
const hours = () =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    opensAt: "10:00",
    closesAt: dayOfWeek === 4 || dayOfWeek === 5 ? "01:00" : "23:30",
    isClosed: false as const,
  }));
const extras = (slug: string, values: [string, string, number][]) =>
  values.map(([name, nameAr, price], index) => ({
    id: `${slug}-extra-${index}`,
    name,
    nameAr,
    price,
    isAvailable: true as const,
  }));
function product(
  restaurant: string,
  index: number,
  category: [string, string, number],
  values: [string, string, string, string, number, string, boolean?],
  productExtras: [string, string, number][] = [],
): DemoProduct {
  const [name, nameAr, description, descriptionAr, price, photo, featured = false] = values;
  return {
    id: `${restaurant}-product-${index}`,
    name,
    nameAr,
    description,
    descriptionAr,
    price,
    availability: "AVAILABLE",
    isAvailable: true,
    isFeatured: featured,
    stock: null,
    sortOrder: index,
    category: { name: category[0], nameAr: category[1], sortOrder: category[2] },
    images: [{ id: `${restaurant}-image-${index}`, url: image(photo), sortOrder: 0 }],
    extras: extras(`${restaurant}-${index}`, productExtras),
  };
}

const sharedDrinkExtras: [string, string, number][] = [
  ["Large size", "حجم كبير", 15],
  ["Extra ice", "ثلج إضافي", 0],
];
const burgerExtras: [string, string, number][] = [
  ["Extra cheese", "جبنة إضافية", 20],
  ["Beef patty", "قطعة لحم إضافية", 55],
  ["Jalapeño", "هالبينو", 10],
];

const demos: DemoRestaurant[] = [
  {
    id: "demo-burger",
    isDemo: true,
    name: "Burger Factory",
    nameAr: "برجر فاكتوري",
    slug: "demo-bistro",
    description: "Fresh smashed burgers, crispy chicken and loaded fries.",
    descriptionAr: "برجر سماش طازج وفراخ كرسبي وبطاطس محملة بصوصات مميزة.",
    whatsapp: "201000000001",
    logoUrl: image("photo-1568901346375-23c9450c58cd"),
    coverUrl: image("photo-1550547660-d9450f859349"),
    currency: "EGP",
    locale: "ar",
    isActive: true,
    address: "شارع التسعين، التجمع الخامس، القاهرة",
    mapUrl: null,
    latitude: null,
    longitude: null,
    phone: "0100 000 0001",
    facebookUrl: null,
    instagramUrl: null,
    settings: { allowOrdering: true, allowOrdersOutsideHours: true, estimatedOrderMinutes: 25 },
    branches: [{ address: "شارع التسعين، التجمع الخامس، القاهرة", workingHours: hours() }],
    products: [
      product("burger", 1, ["Burgers", "برجر", 0], ["Classic Burger", "برجر كلاسيك", "Beef patty, cheddar and factory sauce.", "قطعة لحم وتشيدر وصوص فاكتوري.", 145, "photo-1568901346375-23c9450c58cd", true], burgerExtras),
      product("burger", 2, ["Burgers", "برجر", 0], ["Double Smash", "دابل سماش", "Double beef, double cheese and caramelized onions.", "قطعتان لحم ودابل تشيدر وبصل مكرمل.", 215, "photo-1550547660-d9450f859349", true], burgerExtras),
      product("burger", 3, ["Chicken", "فراخ", 1], ["Crispy Chicken", "كرسبي تشيكن", "Crunchy chicken with coleslaw.", "فراخ مقرمشة مع كول سلو.", 165, "photo-1615297928064-24977384d0da"], [["Spicy sauce", "صوص حار", 10]]),
      product("burger", 4, ["Chicken", "فراخ", 1], ["Grilled Chicken", "تشيكن جريل", "Grilled chicken breast and fresh vegetables.", "صدر فراخ مشوي وخضار طازج.", 175, "photo-1532550907401-a500c9a57435"]),
      product("burger", 5, ["Sides", "إضافات", 2], ["Loaded Fries", "لودد فرايز", "Fries, cheddar sauce and crispy beef.", "بطاطس وصوص تشيدر وقطع لحم مقرمشة.", 95, "photo-1573080496219-bb080dd4f877", true]),
      product("burger", 6, ["Sides", "إضافات", 2], ["French Fries", "بطاطس محمرة", "Golden crispy fries.", "بطاطس ذهبية مقرمشة.", 55, "photo-1576107232684-1279f390859f"]),
      product("burger", 7, ["Drinks", "مشروبات", 3], ["Fresh Mango", "عصير مانجو", "Fresh seasonal mango juice.", "عصير مانجو طبيعي.", 65, "photo-1546173159-315724a31696"], sharedDrinkExtras),
      product("burger", 8, ["Desserts", "حلويات", 4], ["Chocolate Cake", "كيك شوكولاتة", "Rich chocolate layer cake.", "كيك شوكولاتة غني.", 85, "photo-1578985545062-69928b1d9587"]),
    ],
  },
  {
    id: "demo-pizza",
    isDemo: true,
    name: "Pizza Roma",
    nameAr: "بيتزا روما",
    slug: "demo-pizza-roma",
    description: "Italian-style pizza baked fresh with Egyptian favorites.",
    descriptionAr: "بيتزا على الطريقة الإيطالية تُخبز طازجة بنكهات مفضلة في مصر.",
    whatsapp: "201000000002",
    logoUrl: image("photo-1574071318508-1cdbab80d002"),
    coverUrl: image("photo-1579751626657-72bc17010498"),
    currency: "EGP",
    locale: "ar",
    isActive: true,
    address: "شارع جامعة الدول العربية، المهندسين",
    mapUrl: null,
    latitude: null,
    longitude: null,
    phone: "0100 000 0002",
    facebookUrl: null,
    instagramUrl: null,
    settings: { allowOrdering: true, allowOrdersOutsideHours: true, estimatedOrderMinutes: 35 },
    branches: [{ address: "شارع جامعة الدول العربية، المهندسين", workingHours: hours() }],
    products: [
      product("pizza", 1, ["Pizza", "بيتزا", 0], ["Margherita", "مارجريتا", "Tomato, mozzarella and basil.", "طماطم وموتزاريلا وريحان.", 155, "photo-1574071318508-1cdbab80d002", true], [["Extra mozzarella", "موتزاريلا إضافية", 30], ["Large size", "حجم كبير", 55]]),
      product("pizza", 2, ["Pizza", "بيتزا", 0], ["Pepperoni", "بيبروني", "Mozzarella and beef pepperoni.", "موتزاريلا وبيبروني لحم.", 205, "photo-1628840042765-356cda07504e", true]),
      product("pizza", 3, ["Pizza", "بيتزا", 0], ["Chicken Ranch", "تشيكن رانش", "Chicken, ranch sauce and peppers.", "فراخ وصوص رانش وفلفل.", 215, "photo-1565299624946-b28f40a0ae38"]),
      product("pizza", 4, ["Pasta", "باستا", 1], ["Penne Arrabbiata", "بيني أرابياتا", "Penne in spicy tomato sauce.", "مكرونة بصوص طماطم حار.", 135, "photo-1473093295043-cdd812d0e601"]),
      product("pizza", 5, ["Pasta", "باستا", 1], ["Chicken Alfredo", "تشيكن ألفريدو", "Creamy Alfredo pasta with chicken.", "مكرونة ألفريدو كريمي بالفراخ.", 185, "photo-1645112411341-6c4fd023714a", true]),
      product("pizza", 6, ["Starters", "مقبلات", 2], ["Garlic Bread", "خبز بالثوم", "Baked garlic bread with herbs.", "خبز مخبوز بالثوم والأعشاب.", 65, "photo-1619535860434-ba1d8fa12536"]),
      product("pizza", 7, ["Drinks", "مشروبات", 3], ["Fresh Orange", "عصير برتقال", "Freshly squeezed orange juice.", "عصير برتقال فريش.", 60, "photo-1600271886742-f049cd451bba"], sharedDrinkExtras),
      product("pizza", 8, ["Desserts", "حلويات", 4], ["Tiramisu", "تيراميسو", "Classic coffee-flavored Italian dessert.", "حلوى إيطالية كلاسيكية بنكهة القهوة.", 95, "photo-1571877227200-a0d98ea607e9"]),
    ],
  },
  {
    id: "demo-grills",
    isDemo: true,
    name: "Al Sultan Grills",
    nameAr: "السلطان للمشويات",
    slug: "demo-al-sultan",
    description: "Egyptian grills, oriental dishes and fresh mezze.",
    descriptionAr: "مشويات مصرية وأطباق شرقية ومقبلات طازجة.",
    whatsapp: "201000000003",
    logoUrl: image("photo-1529692236671-f1f6cf9683ba"),
    coverUrl: image("photo-1544025162-d76694265947"),
    currency: "EGP",
    locale: "ar",
    isActive: true,
    address: "شارع البحر الأعظم، الجيزة",
    mapUrl: null,
    latitude: null,
    longitude: null,
    phone: "0100 000 0003",
    facebookUrl: null,
    instagramUrl: null,
    settings: { allowOrdering: true, allowOrdersOutsideHours: true, estimatedOrderMinutes: 40 },
    branches: [{ address: "شارع البحر الأعظم، الجيزة", workingHours: hours() }],
    products: [
      product("grills", 1, ["Grills", "مشويات", 0], ["Grilled Kofta", "كفتة مشوية", "Charcoal-grilled kofta with tahini.", "كفتة على الفحم مع طحينة.", 210, "photo-1529692236671-f1f6cf9683ba", true], [["Basmati rice", "أرز بسمتي", 45], ["Tahini", "طحينة", 15]]),
      product("grills", 2, ["Grills", "مشويات", 0], ["Shish Tawook", "شيش طاووق", "Marinated chicken skewers.", "أسياخ فراخ متبلة ومشوية.", 195, "photo-1598514983318-2f64f8f4796c", true]),
      product("grills", 3, ["Grills", "مشويات", 0], ["Mixed Grill", "مشكل مشويات", "Kofta, kebab and shish tawook.", "كفتة وكباب وشيش طاووق.", 340, "photo-1544025162-d76694265947"]),
      product("grills", 4, ["Oriental", "أطباق شرقية", 1], ["Molokhia", "ملوخية", "Egyptian molokhia with garlic.", "ملوخية مصرية بطشة الثوم.", 75, "photo-1547592180-85f173990554"]),
      product("grills", 5, ["Oriental", "أطباق شرقية", 1], ["Basmati Rice", "أرز بسمتي", "Seasoned yellow basmati rice.", "أرز بسمتي أصفر متبل.", 55, "photo-1512058564366-18510be2db19"]),
      product("grills", 6, ["Mezze", "مقبلات", 2], ["Baba Ghanoush", "بابا غنوج", "Smoky eggplant dip.", "باذنجان مدخن متبل.", 45, "photo-1577805947697-89e18249d767"]),
      product("grills", 7, ["Mezze", "مقبلات", 2], ["Fattoush", "فتوش", "Fresh salad with toasted bread.", "سلطة طازجة مع خبز محمص.", 65, "photo-1540420773420-3366772f4999"]),
      product("grills", 8, ["Drinks", "مشروبات", 3], ["Mango Juice", "عصير مانجو", "Fresh mango juice.", "عصير مانجو طبيعي.", 65, "photo-1546173159-315724a31696"], sharedDrinkExtras),
    ],
  },
  {
    id: "demo-coffee",
    isDemo: true,
    name: "Mazag Coffee",
    nameAr: "قهوة المزاج",
    slug: "demo-mazag-coffee",
    description: "Egyptian coffee house with specialty drinks and fresh desserts.",
    descriptionAr: "قهوة مصرية بمشروبات مختصة وحلويات طازجة.",
    whatsapp: "201000000004",
    logoUrl: image("photo-1495474472287-4d71bcdd2085"),
    coverUrl: image("photo-1445116572660-236099ec97a0"),
    currency: "EGP",
    locale: "ar",
    isActive: true,
    address: "شارع الكوربة، مصر الجديدة",
    mapUrl: null,
    latitude: null,
    longitude: null,
    phone: "0100 000 0004",
    facebookUrl: null,
    instagramUrl: null,
    settings: { allowOrdering: true, allowOrdersOutsideHours: true, estimatedOrderMinutes: 15 },
    branches: [{ address: "شارع الكوربة، مصر الجديدة", workingHours: hours() }],
    products: [
      product("coffee", 1, ["Hot Coffee", "قهوة ساخنة", 0], ["Turkish Coffee", "قهوة تركي", "Traditional rich Turkish coffee.", "قهوة تركي مظبوط بقوام غني.", 45, "photo-1495474472287-4d71bcdd2085", true], [["Double", "دوبل", 20], ["Cardamom", "حبهان", 5]]),
      product("coffee", 2, ["Hot Coffee", "قهوة ساخنة", 0], ["Cappuccino", "كابتشينو", "Espresso with steamed milk foam.", "إسبريسو مع لبن وفوم.", 70, "photo-1572442388796-11668a67e53d", true]),
      product("coffee", 3, ["Hot Coffee", "قهوة ساخنة", 0], ["Spanish Latte", "سبانيش لاتيه", "Creamy espresso with sweet milk.", "إسبريسو كريمي بلبن محلى.", 85, "photo-1461023058943-07fcbe16d735"]),
      product("coffee", 4, ["Cold Drinks", "مشروبات باردة", 1], ["Iced Latte", "آيس لاتيه", "Chilled espresso and milk.", "إسبريسو بارد مع اللبن.", 80, "photo-1517701604599-bb29b565090c"], sharedDrinkExtras),
      product("coffee", 5, ["Cold Drinks", "مشروبات باردة", 1], ["Mango Smoothie", "سموزي مانجو", "Mango blended with ice.", "مانجو مضروبة مع الثلج.", 90, "photo-1623065422902-30a2d299bbe4"]),
      product("coffee", 6, ["Tea", "شاي", 2], ["Egyptian Tea", "شاي", "Classic black tea.", "شاي أسود مصري.", 30, "photo-1544787219-7f47ccb76574"], [["Fresh mint", "نعناع فريش", 5]]),
      product("coffee", 7, ["Desserts", "حلويات", 3], ["Lotus Cheesecake", "تشيز كيك لوتس", "Creamy cheesecake with Lotus spread.", "تشيز كيك كريمي بصوص لوتس.", 105, "photo-1565958011703-44f9829ba187", true]),
      product("coffee", 8, ["Desserts", "حلويات", 3], ["Chocolate Brownie", "براوني شوكولاتة", "Warm fudgy chocolate brownie.", "براوني شوكولاتة دافئ.", 85, "photo-1606313564200-e75d5e30476c"]),
    ],
  },
];

export const demoRestaurantCards = demos.map((restaurant) => ({
  slug: restaurant.slug,
  name: restaurant.name,
  nameAr: restaurant.nameAr,
  description: restaurant.description,
  descriptionAr: restaurant.descriptionAr,
  cuisine:
    restaurant.slug === "demo-bistro"
      ? "Burgers"
      : restaurant.slug === "demo-pizza-roma"
        ? "Pizza"
        : restaurant.slug === "demo-al-sultan"
          ? "Egyptian grills"
          : "Coffee shop",
  cuisineAr:
    restaurant.slug === "demo-bistro"
      ? "برجر"
      : restaurant.slug === "demo-pizza-roma"
        ? "بيتزا"
        : restaurant.slug === "demo-al-sultan"
          ? "مشويات مصرية"
          : "كافيه",
  image: restaurant.coverUrl,
  productCount: restaurant.products.length,
}));

export function getDemoRestaurant(slug: string) {
  return demos.find((restaurant) => restaurant.slug === slug) ?? null;
}

export function getDemoProduct(slug: string, productId: string) {
  const restaurant = getDemoRestaurant(slug);
  const product = restaurant?.products.find((item) => item.id === productId);
  return restaurant && product ? { restaurant, product } : null;
}

export function isDemoSlug(slug: string) {
  return demos.some((restaurant) => restaurant.slug === slug);
}
