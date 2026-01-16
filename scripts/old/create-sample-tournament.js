/**
 * Script to create a sample tournament with complete data
 * 
 * Usage:
 *   node scripts/create-sample-tournament.js
 * 
 * Or with custom API URL:
 *   API_URL=http://localhost:3000 node scripts/create-sample-tournament.js
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

// Sample tournament data
const sampleTournament = {
  name: 'Badminton Championship 2025',
  startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
  endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days from now
  categories: [
    { name: "Men's Single", type: 'MENS_SINGLE' },
    { name: "Women's Single", type: 'WOMENS_SINGLE' },
    { name: "Men's Double", type: 'MENS_DOUBLE' },
    { name: "Women's Double", type: 'WOMENS_DOUBLE' },
    { name: 'Mixed Double', type: 'MIXED_DOUBLE' },
  ],
  umpires: [
    { name: 'Nguyễn Văn A', email: 'umpire1@example.com', phone: '0901234567' },
    { name: 'Trần Thị B', email: 'umpire2@example.com', phone: '0912345678' },
    { name: 'Lê Văn C', email: 'umpire3@example.com' },
  ],
  scoringDevices: [
    { name: 'Scoreboard 1', deviceType: 'LED Display' },
    { name: 'Scoreboard 2', deviceType: 'LED Display' },
    { name: 'Tablet Scorekeeper', deviceType: 'Tablet' },
  ],
  courts: [
    { courtNumber: 1, courtName: 'Court A' },
    { courtNumber: 2, courtName: 'Court B' },
    { courtNumber: 3, courtName: 'Court C' },
    { courtNumber: 4, courtName: 'Court D' },
  ],
};

// Sample players data
const samplePlayers = [
  { name: 'Nguyễn Văn Minh', email: 'minh@example.com', phone: '0901234567', gender: 'MALE', level: 'TB', levelDescription: 'Trung bình' },
  { name: 'Trần Thị Hương', email: 'huong@example.com', phone: '0912345678', gender: 'FEMALE', level: 'TB_PLUS', levelDescription: 'Trung bình mạnh' },
  { name: 'Lê Hoàng Nam', email: 'nam@example.com', phone: '0923456789', gender: 'MALE', level: 'Y_PLUS', levelDescription: 'Yếu hơn Trung bình' },
  { name: 'Phan Thị Linh', email: 'linh@example.com', phone: '0934567890', gender: 'FEMALE', level: 'K', levelDescription: 'Khá' },
  { name: 'Vũ Minh Tuấn', email: 'tuan@example.com', phone: '0945678901', gender: 'MALE', level: 'TBY', levelDescription: 'Trung bình - Yếu' },
  { name: 'Đặng Thị Hoa', email: 'hoa@example.com', phone: '0956789012', gender: 'FEMALE', level: 'TB_MINUS', levelDescription: 'Trung bình yếu' },
  { name: 'Bùi Thành Đạt', email: 'dat@example.com', phone: '0967890123', gender: 'MALE', level: 'Y', levelDescription: 'Yếu' },
  { name: 'Hoàng Thị Yến', email: 'yen@example.com', phone: '0978901234', gender: 'FEMALE', level: 'TB', levelDescription: 'Trung bình' },
  { name: 'Đinh Minh Hải', email: 'hai@example.com', phone: '0989012345', gender: 'MALE', level: 'TB_PLUS', levelDescription: 'Trung bình mạnh' },
  { name: 'Ngô Thị Mai', email: 'mai@example.com', phone: '0990123456', gender: 'FEMALE', level: 'K', levelDescription: 'Khá' },
  { name: 'Phạm Văn Long', email: 'long@example.com', phone: '0901122334', gender: 'MALE', level: 'TB', levelDescription: 'Trung bình' },
  { name: 'Lý Thị Lan', email: 'lan@example.com', phone: '0902233445', gender: 'FEMALE', level: 'TB_PLUS', levelDescription: 'Trung bình mạnh' },
  { name: 'Võ Minh Quang', email: 'quang@example.com', phone: '0903344556', gender: 'MALE', level: 'K', levelDescription: 'Khá' },
  { name: 'Đỗ Thị Hồng', email: 'hong@example.com', phone: '0904455667', gender: 'FEMALE', level: 'TB', levelDescription: 'Trung bình' },
  { name: 'Bùi Văn Sơn', email: 'son@example.com', phone: '0905566778', gender: 'MALE', level: 'TB_PLUS', levelDescription: 'Trung bình mạnh' },
  { name: 'Trịnh Thị Nga', email: 'nga@example.com', phone: '0906677889', gender: 'FEMALE', level: 'K', levelDescription: 'Khá' },
];

async function createTournament() {
  try {
    console.log('🏸 Creating sample tournament...');
    console.log('API URL:', API_URL);
    console.log('');

    // Step 1: Create tournament
    console.log('1️⃣ Creating tournament...');
    const tournamentResponse = await fetch(`${API_URL}/api/tournaments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sampleTournament),
    });

    if (!tournamentResponse.ok) {
      const errorText = await tournamentResponse.text();
      throw new Error(`Failed to create tournament: ${tournamentResponse.status} - ${errorText}`);
    }

    const tournamentData = await tournamentResponse.json();
    const tournament = tournamentData.data;
    console.log('✅ Tournament created:', tournament.id);
    console.log('   Name:', tournament.name);
    console.log('   Categories:', tournament.categories.length);
    console.log('   Courts:', tournament.courts.length);
    console.log('');

    // Step 2: Create players
    console.log('2️⃣ Creating players...');
    const playerPromises = samplePlayers.map((player, index) => {
      return fetch(`${API_URL}/api/tournaments/${tournament.id}/players`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(player),
      }).then(async (res) => {
        if (!res.ok) {
          const errorText = await res.text();
          console.error(`   ❌ Failed to create player ${index + 1} (${player.name}):`, errorText);
          return null;
        }
        const data = await res.json();
        console.log(`   ✅ Created player: ${player.name}`);
        return data.data;
      });
    });

    const players = (await Promise.all(playerPromises)).filter(Boolean);
    console.log(`✅ Created ${players.length}/${samplePlayers.length} players`);
    console.log('');

    // Step 3: Create pairs for double categories
    console.log('3️⃣ Creating pairs...');
    const pairs = [];
    
    // Create Men's Double pairs
    if (players.filter(p => p.gender === 'MALE').length >= 4) {
      const malePlayers = players.filter(p => p.gender === 'MALE').slice(0, 8);
      for (let i = 0; i < malePlayers.length - 1; i += 2) {
        const pairResponse = await fetch(`${API_URL}/api/tournaments/${tournament.id}/pairs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: `${malePlayers[i].name} & ${malePlayers[i + 1].name}`,
            playerIds: [malePlayers[i].id, malePlayers[i + 1].id],
          }),
        });
        if (pairResponse.ok) {
          const pairData = await pairResponse.json();
          pairs.push(pairData.data);
          console.log(`   ✅ Created pair: ${pairData.data.name || 'Unnamed'}`);
        }
      }
    }

    // Create Women's Double pairs
    if (players.filter(p => p.gender === 'FEMALE').length >= 4) {
      const femalePlayers = players.filter(p => p.gender === 'FEMALE').slice(0, 8);
      for (let i = 0; i < femalePlayers.length - 1; i += 2) {
        const pairResponse = await fetch(`${API_URL}/api/tournaments/${tournament.id}/pairs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: `${femalePlayers[i].name} & ${femalePlayers[i + 1].name}`,
            playerIds: [femalePlayers[i].id, femalePlayers[i + 1].id],
          }),
        });
        if (pairResponse.ok) {
          const pairData = await pairResponse.json();
          pairs.push(pairData.data);
          console.log(`   ✅ Created pair: ${pairData.data.name || 'Unnamed'}`);
        }
      }
    }

    // Create Mixed Double pairs
    if (players.filter(p => p.gender === 'MALE').length >= 2 && players.filter(p => p.gender === 'FEMALE').length >= 2) {
      const malePlayers = players.filter(p => p.gender === 'MALE').slice(0, 4);
      const femalePlayers = players.filter(p => p.gender === 'FEMALE').slice(0, 4);
      for (let i = 0; i < Math.min(malePlayers.length, femalePlayers.length); i++) {
        const pairResponse = await fetch(`${API_URL}/api/tournaments/${tournament.id}/pairs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: `${malePlayers[i].name} & ${femalePlayers[i].name}`,
            playerIds: [malePlayers[i].id, femalePlayers[i].id],
          }),
        });
        if (pairResponse.ok) {
          const pairData = await pairResponse.json();
          pairs.push(pairData.data);
          console.log(`   ✅ Created pair: ${pairData.data.name || 'Unnamed'}`);
        }
      }
    }

    console.log(`✅ Created ${pairs.length} pairs`);
    console.log('');

    // Step 4: Register players/pairs to categories
    console.log('4️⃣ Registering players/pairs to categories...');
    const categories = tournament.categories;
    
    for (const category of categories) {
      console.log(`   Registering to category: ${category.name} (${category.type})`);
      
      if (category.type === 'MENS_SINGLE' || category.type === 'WOMENS_SINGLE') {
        // Single category - register players
        const gender = category.type === 'MENS_SINGLE' ? 'MALE' : 'FEMALE';
        const categoryPlayers = players.filter(p => p.gender === gender).slice(0, 8);
        
        for (const player of categoryPlayers) {
          const regResponse = await fetch(`${API_URL}/api/categories/${category.id}/registrations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              playerId: player.id,
            }),
          });
          if (regResponse.ok) {
            console.log(`      ✅ Registered: ${player.name}`);
          }
        }
      } else {
        // Double category - register pairs
        let categoryPairs = [];
        if (category.type === 'MENS_DOUBLE') {
          categoryPairs = pairs.filter(p => {
            const pairPlayers = p.members?.map(m => m.player) || [];
            return pairPlayers.every(pp => pp.gender === 'MALE');
          }).slice(0, 4);
        } else if (category.type === 'WOMENS_DOUBLE') {
          categoryPairs = pairs.filter(p => {
            const pairPlayers = p.members?.map(m => m.player) || [];
            return pairPlayers.every(pp => pp.gender === 'FEMALE');
          }).slice(0, 4);
        } else if (category.type === 'MIXED_DOUBLE') {
          categoryPairs = pairs.filter(p => {
            const pairPlayers = p.members?.map(m => m.player) || [];
            return pairPlayers.some(pp => pp.gender === 'MALE') && 
                   pairPlayers.some(pp => pp.gender === 'FEMALE');
          }).slice(0, 4);
        }
        
        for (const pair of categoryPairs) {
          const regResponse = await fetch(`${API_URL}/api/categories/${category.id}/registrations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              pairId: pair.id,
            }),
          });
          if (regResponse.ok) {
            console.log(`      ✅ Registered: ${pair.name || 'Unnamed pair'}`);
          }
        }
      }
    }
    console.log('');

    // Summary
    console.log('🎉 Sample tournament created successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   Tournament ID: ${tournament.id}`);
    console.log(`   Tournament Name: ${tournament.name}`);
    console.log(`   Categories: ${categories.length}`);
    console.log(`   Players: ${players.length}`);
    console.log(`   Pairs: ${pairs.length}`);
    console.log(`   Courts: ${tournament.courts.length}`);
    console.log(`   Umpires: ${tournament.umpires.length}`);
    console.log(`   Scoring Devices: ${tournament.scoringDevices.length}`);
    console.log('');
    console.log(`🌐 View tournament at: ${API_URL}/tournaments/${tournament.id}`);
    console.log(`⚙️  Manage tournament at: ${API_URL}/tournaments/${tournament.id}/manage`);

  } catch (error) {
    console.error('❌ Error creating sample tournament:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Check if running directly
if (require.main === module) {
  createTournament();
}

module.exports = { createTournament, sampleTournament, samplePlayers };


