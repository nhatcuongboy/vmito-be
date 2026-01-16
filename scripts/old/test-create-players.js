// Simple test to create a few players
async function testCreatePlayers() {
  const sessionId = 'cmeejcmnl000l0q36twqkh3gf';
  const apiUrl = 'http://localhost:3002';

  // Simple test data with just 3 players
  const testPlayers = [
    {
      playerNumber: 1,
      name: 'Nguyễn Văn A',
      gender: 'MALE',
      level: 'TB',
      levelDescription: 'Trung bình',
      phone: '0901111111',
      requireConfirmInfo: false,
    },
    {
      playerNumber: 2,
      name: 'Trần Thị B',
      gender: 'FEMALE',
      level: 'TB_PLUS',
      levelDescription: 'Trung bình mạnh',
      phone: '0902222222',
      requireConfirmInfo: true,
    },
    {
      playerNumber: 3,
      name: 'Lê Văn C',
      gender: 'MALE',
      level: 'Y',
      levelDescription: 'Yếu',
      phone: '0903333333',
      requireConfirmInfo: false,
    },
  ];

  console.log('Testing API with 3 players...');
  console.log('Session ID:', sessionId);
  console.log('Players to create:', JSON.stringify(testPlayers, null, 2));

  // This will work in browser console or with proper fetch polyfill
  const url = `${apiUrl}/api/sessions/${sessionId}/players/bulk`;
  console.log('API URL:', url);
  console.log('Payload:', JSON.stringify(testPlayers, null, 2));
}

testCreatePlayers();
