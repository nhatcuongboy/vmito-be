// Script to create 12 random players for a specific session
const sessionId = 'cmeejcmnl000l0q36twqkh3gf';
const apiUrl = 'http://localhost:3002'; // Adjust port if needed

// Diverse Vietnamese names for players
const names = {
  male: [
    'Nguyễn Văn Minh',
    'Trần Đức Thành',
    'Lê Hoàng Nam',
    'Phan Văn Hùng',
    'Vũ Minh Tuấn',
    'Đặng Quốc Anh',
    'Bùi Thành Đạt',
    'Hoàng Văn Long',
    'Đinh Minh Hải',
    'Lý Quang Dũng',
    'Phạm Thành Vinh',
    'Ngô Văn Khôi',
  ],
  female: [
    'Nguyễn Thị Lan',
    'Trần Thị Hương',
    'Lê Thị Mai',
    'Phan Thị Linh',
    'Vũ Thị Nga',
    'Đặng Thị Hoa',
    'Bùi Thị Thảo',
    'Hoàng Thị Yến',
    'Đinh Thị Thu',
    'Lý Thị Kim',
    'Phạm Thị Hà',
    'Ngô Thị Vân',
  ],
};

const genders = ['MALE', 'FEMALE'];
const levels = [
  'Y_MINUS',
  'Y',
  'Y_PLUS',
  'TBY',
  'TB_MINUS',
  'TB',
  'TB_PLUS',
  'K',
];
const levelDescriptions = {
  Y_MINUS: 'Yếu hơn mức Y',
  Y: 'Mức độ Yếu',
  Y_PLUS: 'Yếu hơn Trung bình - Yếu',
  TBY: 'Trung bình - Yếu',
  TB_MINUS: 'Trung bình yếu',
  TB: 'Trung bình',
  TB_PLUS: 'Trung bình mạnh',
  K: 'Khá',
};

// Generate random phone numbers
function generatePhoneNumber() {
  const prefixes = [
    '090',
    '091',
    '092',
    '093',
    '094',
    '095',
    '096',
    '097',
    '098',
    '099',
  ];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const number = Math.floor(Math.random() * 10000000)
    .toString()
    .padStart(7, '0');
  return prefix + number;
}

// Generate 12 diverse players
function generateRandomPlayers() {
  const players = [];

  for (let i = 1; i <= 12; i++) {
    const gender = genders[Math.floor(Math.random() * genders.length)];
    const nameList = gender === 'MALE' ? names.male : names.female;
    const name = nameList[Math.floor(Math.random() * nameList.length)];
    const level = levels[Math.floor(Math.random() * levels.length)];

    const player = {
      playerNumber: i,
      name: name,
      gender: gender,
      level: level,
      levelDescription: levelDescriptions[level],
      phone: generatePhoneNumber(),
      requireConfirmInfo: Math.random() < 0.3, // 30% chance to require confirmation
    };

    players.push(player);
  }

  return players;
}

// Create players via API
async function createRandomPlayers() {
  try {
    console.log(`🚀 Creating 12 random players for session: ${sessionId}`);

    const players = generateRandomPlayers();

    console.log('📋 Generated players:');
    players.forEach((player, index) => {
      console.log(
        `  ${index + 1}. ${player.name} (${player.gender}) - Level: ${player.level}`
      );
    });

    console.log('\n🔄 Sending request to API...');

    const response = await fetch(
      `${apiUrl}/api/sessions/${sessionId}/players/bulk`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(players),
      }
    );

    const result = await response.json();

    if (response.ok && result.success) {
      console.log('✅ Players created successfully!');
      console.log(`📊 Created ${result.data.createdPlayers.length} players`);
      console.log('🎯 Player details:');

      result.data.createdPlayers.forEach((player, index) => {
        console.log(
          `  ${index + 1}. ${player.name} - Player #${player.playerNumber}`
        );
        console.log(`     Gender: ${player.gender}, Level: ${player.level}`);
        console.log(`     Phone: ${player.phone}`);
        console.log(`     Join Code: ${player.joinCode}`);
        console.log(`     ID: ${player.id}`);
        console.log('');
      });
    } else {
      console.error('❌ Failed to create players:');
      console.error('Response status:', response.status);
      console.error('Error:', result.message || result);
    }
  } catch (error) {
    console.error('💥 Error creating players:', error.message);
  }
}

// Node.js environment check
if (typeof fetch === 'undefined') {
  // Install node-fetch if not available
  console.log('📦 Installing node-fetch...');
  require('child_process').execSync('npm install node-fetch', {
    stdio: 'inherit',
  });
  global.fetch = require('node-fetch');
}

// Run the script
createRandomPlayers();
