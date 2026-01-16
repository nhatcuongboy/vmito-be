// Script to list all users in the database
const { PrismaClient } = require('../src/generated/prisma');

const prisma = new PrismaClient();

async function listUsers() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        password: true, // To check if password is set
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`\n📊 Found ${users.length} user(s) in database:\n`);

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email})`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Password: ${user.password ? '✅ Set' : '❌ Not set'}`);
      console.log(`   Created: ${user.createdAt.toLocaleString()}`);
      console.log('');
    });

    if (users.length === 0) {
      console.log(
        'No users found in database. Run create-user.js to create one.'
      );
    }
  } catch (error) {
    console.error('❌ Error fetching users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

listUsers();
