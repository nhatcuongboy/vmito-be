/**
 * Script to add pairs to CS Badminton tournament
 * 
 * Usage:
 *   node scripts/add-tournament-pairs.js
 * 
 * Or with custom tournament ID:
 *   TOURNAMENT_ID=your-tournament-id node scripts/add-tournament-pairs.js
 */

const { PrismaClient } = require('../src/generated/prisma');

const prisma = new PrismaClient();

// Tournament ID
const TOURNAMENT_ID = process.env.TOURNAMENT_ID || 'cmid2nngg000142fv7o3zcep4';

// Pairs data from the image
const pairsData = [
    {
        name: 'Mix-1',
        type: 'MIXED_DOUBLE',
        player1: 'Trần Mạnh Linh',
        player2: 'Hoàng Thị Cẩm Giang',
    },
    {
        name: 'Mix-2',
        type: 'MIXED_DOUBLE',
        player1: 'Nguyễn Trọng Tiến',
        player2: 'Nguyễn Thị Trinh',
    },
    {
        name: 'Mix-3',
        type: 'MIXED_DOUBLE',
        player1: 'Vũ Quốc Phong',
        player2: 'Nguyễn Thị Hồng Vân',
    },
    {
        name: 'Mix-4',
        type: 'MIXED_DOUBLE',
        player1: 'Nguyễn Hoàng Kim Thư',
        player2: 'Võ Quang Hùng',
    },
    {
        name: 'Men-7',
        type: 'MENS_DOUBLE',
        player1: 'Nguyễn Văn Tâm',
        player2: 'Phan Minh Vũ Chinh',
    },
    {
        name: 'Men-1',
        type: 'MENS_DOUBLE',
        player1: 'Nguyễn Trọng Thanh',
        player2: 'Võ Quang Hùng',
    },
    {
        name: 'Men-2',
        type: 'MENS_DOUBLE',
        player1: 'Bùi Hoàng Trung',
        player2: 'Phan Chí Cường',
    },
    {
        name: 'Men-3',
        type: 'MENS_DOUBLE',
        player1: 'Nguyễn Văn Thành',
        player2: 'Nguyễn Hoàng Việt',
    },
    {
        name: 'Men-4',
        type: 'MENS_DOUBLE',
        player1: 'Vũ Trọng Phúc',
        player2: 'Phạm Quốc Bảo',
    },
    {
        name: 'Men-5',
        type: 'MENS_DOUBLE',
        player1: 'Nguyễn Văn Hiếu',
        player2: 'Dương Ngọc Hải',
    },
    {
        name: 'Men-6',
        type: 'MENS_DOUBLE',
        player1: 'Trần Đình Quang',
        player2: 'Trần Mạnh Linh',
    },
    {
        name: 'Men-8',
        type: 'MENS_DOUBLE',
        player1: 'Nguyễn Vũ Nhật Cường',
        player2: 'Hoàng Lê Hải',
    },
];

async function addPairs() {
    try {
        console.log('🏸 Adding pairs to CS Badminton tournament...');
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

        // Get all players in the tournament
        const allPlayers = await prisma.tournamentPlayer.findMany({
            where: { tournamentId: TOURNAMENT_ID },
            select: { id: true, name: true },
        });

        console.log(`📋 Found ${allPlayers.length} players in tournament`);
        console.log('');

        // Create a map of player names to IDs
        const playerMap = new Map();
        allPlayers.forEach((player) => {
            playerMap.set(player.name, player.id);
        });

        // Check existing pairs
        const existingPairs = await prisma.tournamentPair.findMany({
            where: { tournamentId: TOURNAMENT_ID },
            select: { name: true },
        });

        if (existingPairs.length > 0) {
            console.log(`⚠️  Tournament already has ${existingPairs.length} pairs:`);
            existingPairs.forEach((p) => console.log(`   - ${p.name || 'Unnamed'}`));
            console.log('');
            console.log('Do you want to continue? (This will add new pairs)');
            console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...');
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        console.log('1️⃣ Creating pairs...');
        const createdPairs = [];
        const skippedPairs = [];

        for (const pairData of pairsData) {
            // Check if pair already exists
            const existing = await prisma.tournamentPair.findFirst({
                where: {
                    tournamentId: TOURNAMENT_ID,
                    name: pairData.name,
                },
            });

            if (existing) {
                console.log(`   ⏭️  Skipped (already exists): ${pairData.name}`);
                skippedPairs.push(pairData);
                continue;
            }

            // Find player IDs
            const player1Id = playerMap.get(pairData.player1);
            const player2Id = playerMap.get(pairData.player2);

            if (!player1Id) {
                console.log(`   ❌ Error: Player "${pairData.player1}" not found`);
                skippedPairs.push({ ...pairData, error: `Player 1 not found: ${pairData.player1}` });
                continue;
            }

            if (!player2Id) {
                console.log(`   ❌ Error: Player "${pairData.player2}" not found`);
                skippedPairs.push({ ...pairData, error: `Player 2 not found: ${pairData.player2}` });
                continue;
            }

            // Check if players are already in a pair together
            const existingPairWithPlayers = await prisma.tournamentPair.findFirst({
                where: {
                    tournamentId: TOURNAMENT_ID,
                    members: {
                        every: {
                            playerId: { in: [player1Id, player2Id] },
                        },
                    },
                },
                include: {
                    members: true,
                },
            });

            if (existingPairWithPlayers && existingPairWithPlayers.members.length === 2) {
                console.log(`   ⏭️  Skipped (players already paired): ${pairData.name}`);
                skippedPairs.push({ ...pairData, error: 'Players already paired together' });
                continue;
            }

            // Create pair
            const pair = await prisma.tournamentPair.create({
                data: {
                    tournamentId: TOURNAMENT_ID,
                    name: pairData.name,
                    type: pairData.type,
                    members: {
                        create: [
                            { playerId: player1Id, position: 1 },
                            { playerId: player2Id, position: 2 },
                        ],
                    },
                },
                include: {
                    members: {
                        include: {
                            player: true,
                        },
                    },
                },
            });

            createdPairs.push(pair);
            console.log(`   ✅ Created: ${pairData.name} (${pairData.type}) - ${pairData.player1} & ${pairData.player2}`);
        }

        console.log('');
        console.log('✅ Pairs added successfully!');
        console.log('');
        console.log('📊 Summary:');
        console.log(`   Total pairs in tournament: ${existingPairs.length + createdPairs.length}`);
        console.log(`   New pairs created: ${createdPairs.length}`);
        console.log(`   Skipped: ${skippedPairs.length}`);
        console.log('');

        if (skippedPairs.length > 0) {
            console.log('⚠️  Skipped pairs:');
            skippedPairs.forEach((p) => {
                console.log(`   - ${p.name}: ${p.error || 'Already exists'}`);
            });
            console.log('');
        }

        // Show type breakdown
        const allPairs = await prisma.tournamentPair.findMany({
            where: { tournamentId: TOURNAMENT_ID },
            select: { type: true },
        });

        const mixedCount = allPairs.filter((p) => p.type === 'MIXED_DOUBLE').length;
        const mensCount = allPairs.filter((p) => p.type === 'MENS_DOUBLE').length;
        const womensCount = allPairs.filter((p) => p.type === 'WOMENS_DOUBLE').length;

        console.log('📈 Type Breakdown:');
        console.log(`   Mixed Doubles: ${mixedCount}`);
        console.log(`   Men's Doubles: ${mensCount}`);
        console.log(`   Women's Doubles: ${womensCount}`);
        console.log('');

    } catch (error) {
        console.error('❌ Error adding pairs:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the script
if (require.main === module) {
    addPairs();
}

module.exports = { addPairs, pairsData };

