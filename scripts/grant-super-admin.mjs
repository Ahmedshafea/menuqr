import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const email = String(process.argv[2] || process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();

if (!/^\S+@\S+\.\S+$/.test(email)) {
  console.error("Usage: npm run admin:grant -- admin@example.com");
  process.exitCode = 1;
} else {
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw new Error("USER_NOT_FOUND");
    await prisma.$transaction(async (tx) => {
      await tx.userRole.upsert({ where: { userId_role: { userId: user.id, role: "SUPER_ADMIN" } }, create: { userId: user.id, role: "SUPER_ADMIN" }, update: {} });
      await tx.auditLog.create({ data: { action: "SUPER_ADMIN_GRANTED", entity: "User", entityId: user.id, userId: user.id, metadata: { source: "secure_bootstrap_cli" } } });
    });
    console.log("Super Admin access granted successfully.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "ADMIN_GRANT_FAILED");
    process.exitCode = 1;
  }
}

await prisma.$disconnect();
