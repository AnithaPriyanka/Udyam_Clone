import { PrismaClient } from '@prisma/client';
let prismaGlobal;

if (process.env.NODE_ENV === 'test') {
  if (!global.__PRISMA__) {
    global.__PRISMA__ = new PrismaClient();
  }
  prismaGlobal = global.__PRISMA__;
} else {
  prismaGlobal = new PrismaClient();
}

export const prisma = prismaGlobal;
