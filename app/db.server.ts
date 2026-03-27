import { PrismaClient } from "@prisma/client";

declare global {
  // evita recriar Prisma no dev (hot reload)
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

let prisma: PrismaClient;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  });
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      datasourceUrl: "file:dev.sqlite",
    });
  }
  prisma = global.__prisma;
}

export { prisma };
export default prisma; 