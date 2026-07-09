/**
 * Seeds the system "Vmito Bot" user that hosts all crawled (vãng lai)
 * Facebook sessions. Idempotent: re-running only updates the display fields.
 *
 * Run with:  npx ts-node prisma/seed-crawler-bot.ts
 * Then copy the printed id into CRAWLER_BOT_USER_ID in your .env.
 */
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

const BOT_EMAIL = 'bot@vmito.system';

async function main() {
  const bot = await prisma.user.upsert({
    where: { email: BOT_EMAIL },
    update: { name: 'Vmito Bot' },
    create: {
      email: BOT_EMAIL,
      name: 'Vmito Bot',
      role: Role.HOST,
    },
  });

  console.log('Vmito Bot user ready.');
  console.log('CRAWLER_BOT_USER_ID=' + bot.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
