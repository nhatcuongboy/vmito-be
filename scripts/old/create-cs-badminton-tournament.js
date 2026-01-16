/**
 * Script to create CS Badminton tournament
 * 
 * Usage:
 *   node scripts/create-cs-badminton-tournament.js
 * 
 * Or with custom host ID:
 *   HOST_ID=your-host-id node scripts/create-cs-badminton-tournament.js
 */

const { PrismaClient } = require('../src/generated/prisma');

const prisma = new PrismaClient();

// Tournament data
const tournamentData = {
  name: 'Giải cầu lông nội bộ CS Badminton - Lần I',
  // Set dates in UTC to avoid timezone issues
  // Start date: November 29, 2025 00:00:00 UTC
  startDate: new Date(Date.UTC(2025, 10, 29, 0, 0, 0)),
  // End date: November 30, 2025 00:00:00 UTC (represents end of Nov 29)
  endDate: new Date(Date.UTC(2025, 10, 30, 0, 0, 0)),
  categories: [
    { name: 'Đôi nam', type: 'MENS_DOUBLE' },
    { name: 'Đôi nam-nữ', type: 'MIXED_DOUBLE' },
  ],
  courts: [
    { courtNumber: 1, courtName: 'Sân 1' },
    { courtNumber: 2, courtName: 'Sân 2' },
    { courtNumber: 3, courtName: 'Sân 3' },
  ],
};

async function createTournament() {
  try {
    console.log('🏸 Creating CS Badminton tournament...');
    console.log('');

    // Find a HOST user
    let hostId = process.env.HOST_ID;
    
    if (!hostId) {
      const host = await prisma.user.findFirst({
        where: { role: 'HOST' },
      });
      
      if (!host) {
        throw new Error('No HOST user found. Please create a HOST user first or provide HOST_ID environment variable.');
      }
      
      hostId = host.id;
      console.log(`✅ Found HOST user: ${host.name} (${host.email})`);
    } else {
      const host = await prisma.user.findUnique({
        where: { id: hostId },
      });
      
      if (!host) {
        throw new Error(`HOST user with ID ${hostId} not found.`);
      }
      
      if (host.role !== 'HOST') {
        throw new Error(`User ${host.name} is not a HOST.`);
      }
      
      console.log(`✅ Using HOST user: ${host.name} (${host.email})`);
    }
    
    console.log('');

    // Create tournament
    console.log('1️⃣ Creating tournament...');
    const tournament = await prisma.tournament.create({
      data: {
        name: tournamentData.name,
        startDate: tournamentData.startDate,
        endDate: tournamentData.endDate,
        hostId: hostId,
        status: 'PREPARING',
        categories: {
          create: tournamentData.categories.map((cat) => ({
            name: cat.name,
            type: cat.type,
          })),
        },
        courts: {
          create: tournamentData.courts.map((court) => ({
            courtNumber: court.courtNumber,
            courtName: court.courtName,
          })),
        },
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        categories: true,
        courts: {
          orderBy: {
            courtNumber: 'asc',
          },
        },
        _count: {
          select: {
            players: true,
            pairs: true,
            categories: true,
          },
        },
      },
    });

    console.log('✅ Tournament created successfully!');
    console.log('');
    console.log('📊 Tournament Details:');
    console.log(`   ID: ${tournament.id}`);
    console.log(`   Name: ${tournament.name}`);
    console.log(`   Start Date: ${tournament.startDate.toLocaleDateString('vi-VN')}`);
    console.log(`   End Date: ${tournament.endDate.toLocaleDateString('vi-VN')}`);
    console.log(`   Host: ${tournament.host.name} (${tournament.host.email})`);
    console.log('');
    console.log('📋 Categories:');
    tournament.categories.forEach((cat, index) => {
      console.log(`   ${index + 1}. ${cat.name} (${cat.type})`);
    });
    console.log('');
    console.log('🏟️  Courts:');
    tournament.courts.forEach((court) => {
      console.log(`   ${court.courtNumber}. ${court.courtName || 'Unnamed'}`);
    });
    console.log('');
    console.log('🎉 Tournament created successfully!');
    console.log('');
    console.log(`🌐 View tournament at: http://localhost:3000/tournaments/${tournament.id}`);
    console.log(`⚙️  Manage tournament at: http://localhost:3000/tournaments/${tournament.id}/manage`);

  } catch (error) {
    console.error('❌ Error creating tournament:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  createTournament();
}

module.exports = { createTournament, tournamentData };

