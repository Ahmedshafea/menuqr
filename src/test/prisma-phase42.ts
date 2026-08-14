import { PrismaClient } from "@prisma/client";

const globalForPhase42 = globalThis as unknown as { phase42Prisma?: PrismaClient };

export const prisma = globalForPhase42.phase42Prisma ?? new PrismaClient({
  transactionOptions: {
    maxWait: 10_000,
    timeout: 30_000,
  },
});

globalForPhase42.phase42Prisma = prisma;
