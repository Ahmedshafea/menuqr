import "next-auth";
declare module "next-auth" { interface User { role?: string; restaurantId?: string | null } interface Session { user: { id: string; role: string; restaurantId?: string | null; name?: string | null; email?: string | null; image?: string | null } } }
declare module "next-auth/jwt" { interface JWT { role?: string; restaurantId?: string | null } }
