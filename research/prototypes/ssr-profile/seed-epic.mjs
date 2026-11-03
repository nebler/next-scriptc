// Run from the Epic clone after migration. No passwords or auth records needed.
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
for (let i = 0; i < 100; i++)
  await p.user.upsert({
    where: { id: `local-${i}` },
    update: {},
    create: {
      id: `local-${i}`,
      email: `user${i}@example.test`,
      username: `user${i}`,
      name: `Local Person ${i} & team`,
    },
  });
await p.$disconnect();
