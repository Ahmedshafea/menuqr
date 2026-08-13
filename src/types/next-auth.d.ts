import "next-auth";

declare module "next-auth" {
  interface User {
    roles?: string[];
    restaurantId?: string | null;
    sessionVersion?: number;
  }
  interface Session {
    user: {
      id: string;
      roles: string[];
      restaurantId?: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    roles?: string[];
    restaurantId?: string | null;
    sessionVersion?: number;
  }
}
