import { PrismaClient } from '@prisma/client';
import { removeVietnameseTones } from '../src/common/utils/string.utils';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting search terms backfill...');

  // 1. Update Users
  console.log('Updating Users...');
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, phone: true },
  });
  for (const user of users) {
    const searchTerms = removeVietnameseTones(
      `${user.name} ${user.email} ${user.phone || ''}`
    ).toLowerCase();
    await prisma.user.update({
      where: { id: user.id },
      data: { searchTerms },
    });
  }
  console.log(`Updated ${users.length} users.`);

  // 2. Update Sessions
  console.log('Updating Sessions...');
  const sessions = await prisma.session.findMany({
    select: {
      id: true,
      name: true,
      location: true,
      hostName: true,
      venue: { select: { name: true, address: true } },
    },
  });
  for (const session of sessions) {
    const searchTerms = removeVietnameseTones(
      `${session.name} ${session.location || ''} ${session.hostName || ''} ${session.venue?.name || ''} ${session.venue?.address || ''}`
    ).toLowerCase();
    await prisma.session.update({
      where: { id: session.id },
      data: { searchTerms },
    });
  }
  console.log(`Updated ${sessions.length} sessions.`);

  // 3. Update Venues
  console.log('Updating Venues...');
  const venues = await prisma.venue.findMany({
    select: { id: true, name: true, address: true, district: true, city: true },
  });
  for (const venue of venues) {
    const searchTerms = removeVietnameseTones(
      `${venue.name} ${venue.address} ${venue.district || ''} ${venue.city || ''}`
    ).toLowerCase();
    await prisma.venue.update({
      where: { id: venue.id },
      data: { searchTerms },
    });
  }
  console.log(`Updated ${venues.length} venues.`);

  // 4. Update Clubs
  console.log('Updating Clubs...');
  const clubs = await prisma.club.findMany({
    select: { id: true, name: true, description: true, location: true },
  });
  for (const club of clubs) {
    const searchTerms = removeVietnameseTones(
      `${club.name} ${club.description || ''} ${club.location || ''}`
    ).toLowerCase();
    await prisma.club.update({
      where: { id: club.id },
      data: { searchTerms },
    });
  }
  console.log(`Updated ${clubs.length} clubs.`);

  console.log('Backfill completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
