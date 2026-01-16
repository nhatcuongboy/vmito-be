/**
 * Script to add players to CS Badminton tournament
 * 
 * Usage:
 *   node scripts/add-cs-badminton-players.js
 * 
 * Or with custom tournament ID:
 *   TOURNAMENT_ID=your-tournament-id node scripts/add-cs-badminton-players.js
 */

const { PrismaClient } = require('../src/generated/prisma');

const prisma = new PrismaClient();

// Tournament ID
const TOURNAMENT_ID = process.env.TOURNAMENT_ID || 'cmid2nngg000142fv7o3zcep4';

// Players data from the image
const playersData = [
    { name: 'Bùi Hoàng Trung', gender: 'MALE' },
    { name: 'Dương Ngọc Hải', gender: 'MALE' },
    { name: 'Hoàng Lê Hải', gender: 'MALE' },
    { name: 'Hoàng Thị Cẩm Giang', gender: 'FEMALE' },
    { name: 'Nguyễn Hoàng Kim Thư', gender: 'FEMALE' },
    { name: 'Nguyễn Hoàng Việt', gender: 'MALE' },
    { name: 'Nguyễn Thị Hồng Vân', gender: 'FEMALE' },
    { name: 'Nguyễn Thị Trinh', gender: 'FEMALE' },
    { name: 'Nguyễn Trọng Thanh', gender: 'MALE' },
    { name: 'Nguyễn Trọng Tiến', gender: 'MALE' },
    { name: 'Nguyễn Văn Hiếu', gender: 'MALE' },
    { name: 'Nguyễn Văn Thành', gender: 'MALE' },
    { name: 'Nguyễn Văn Tâm', gender: 'MALE' },
    { name: 'Nguyễn Vũ Nhật Cường', gender: 'MALE' },
    { name: 'Phan Chí Cường', gender: 'MALE' },
    { name: 'Phan Minh Vũ Chinh', gender: 'MALE' },
    { name: 'Phạm Quốc Bảo', gender: 'MALE' },
    { name: 'Trần Mạnh Linh', gender: 'MALE' },
    { name: 'Trần Đình Quang', gender: 'MALE' },
    { name: 'Võ Quang Hùng', gender: 'MALE' },
    { name: 'Vũ Quốc Phong', gender: 'MALE' },
    { name: 'Vũ Trọng Phúc', gender: 'MALE' },
];

async function addPlayers() {
    try {
        console.log('🏸 Adding players to CS Badminton tournament...');
        console.log(`Tournament ID: ${TOURNAMENT_ID}`);
        console.log('');

        // Check if tournament exists
        const tournament = await prisma.tournament.findUnique({
            where: { id: TOURNAMENT_ID },
            select: { id: true, name: true },
        });

        if (!tournament) {
            throw new Error(`Tournament with ID ${TOURNAMENT_ID} not found.`);
        }

        console.log(`✅ Found tournament: ${tournament.name}`);
        console.log('');

        // Check existing players
        const existingPlayers = await prisma.tournamentPlayer.findMany({
            where: { tournamentId: TOURNAMENT_ID },
            select: { name: true },
        });

        if (existingPlayers.length > 0) {
            console.log(`⚠️  Tournament already has ${existingPlayers.length} players:`);
            existingPlayers.forEach((p) => console.log(`   - ${p.name}`));
            console.log('');
            console.log('Do you want to continue? (This will add new players)');
            console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...');
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        console.log('1️⃣ Creating players...');
        const createdPlayers = [];

        for (const playerData of playersData) {
            // Check if player already exists
            const existing = await prisma.tournamentPlayer.findFirst({
                where: {
                    tournamentId: TOURNAMENT_ID,
                    name: playerData.name,
                },
            });

            if (existing) {
                console.log(`   ⏭️  Skipped (already exists): ${playerData.name}`);
                continue;
            }

            const player = await prisma.tournamentPlayer.create({
                data: {
                    tournamentId: TOURNAMENT_ID,
                    name: playerData.name,
                    gender: playerData.gender,
                },
            });

            createdPlayers.push(player);
            console.log(`   ✅ Created: ${playerData.name} (${playerData.gender})`);
        }

        console.log('');
        console.log('✅ Players added successfully!');
        console.log('');
        console.log('📊 Summary:');
        console.log(`   Total players in tournament: ${existingPlayers.length + createdPlayers.length}`);
        console.log(`   New players created: ${createdPlayers.length}`);
        console.log(`   Skipped (already exists): ${playersData.length - createdPlayers.length}`);
        console.log('');

        // Show gender breakdown
        const allPlayers = await prisma.tournamentPlayer.findMany({
            where: { tournamentId: TOURNAMENT_ID },
            select: { gender: true },
        });

        const maleCount = allPlayers.filter((p) => p.gender === 'MALE').length;
        const femaleCount = allPlayers.filter((p) => p.gender === 'FEMALE').length;

        console.log('👥 Gender Breakdown:');
        console.log(`   Male: ${maleCount}`);
        console.log(`   Female: ${femaleCount}`);
        console.log('');

    } catch (error) {
        console.error('❌ Error adding players:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the script
if (require.main === module) {
    addPlayers();
}

module.exports = { addPlayers, playersData };


