import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Configure Cloudinary using CLOUDINARY_URL or individual credentials
if (process.env.CLOUDINARY_URL) {
  cloudinary.config(process.env.CLOUDINARY_URL);
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

async function uploadLocalFile(filePath: string, folder: string): Promise<{ url: string; publicId: string } | null> {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      return null;
    }

    const result = await cloudinary.uploader.upload(filePath, {
      folder: `badminton/${folder}`,
      resource_type: 'image',
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error(`Failed to upload ${filePath}:`, error);
    return null;
  }
}

async function migrateQrCodes() {
  console.log('Migrating QR codes...');
  
  const settings = await prisma.hostPaymentSettings.findMany({
    where: {
      qrCodeUrl: { not: null },
      qrCodePublicId: null,
    },
  });

  let migrated = 0;
  let failed = 0;

  for (const setting of settings) {
    if (!setting.qrCodeUrl) continue;

    if (setting.qrCodeUrl.includes('cloudinary.com')) {
      console.log(`Skipping already migrated: ${setting.id}`);
      continue;
    }

    const localPath = path.join(process.cwd(), setting.qrCodeUrl);
    const result = await uploadLocalFile(localPath, 'qr-codes');

    if (result) {
      await prisma.hostPaymentSettings.update({
        where: { id: setting.id },
        data: {
          qrCodeUrl: result.url,
          qrCodePublicId: result.publicId,
        },
      });
      console.log(`✓ Migrated QR code for setting ${setting.id}`);
      migrated++;
    } else {
      console.error(`✗ Failed to migrate QR code for setting ${setting.id}`);
      failed++;
    }
  }

  console.log(`QR codes migration: ${migrated} migrated, ${failed} failed`);
}

async function migratePaymentProofs() {
  console.log('Migrating payment proofs...');
  
  const payments = await prisma.paymentRecord.findMany({
    where: {
      proofImageUrl: { not: null },
      proofImagePublicId: null,
    },
  });

  let migrated = 0;
  let failed = 0;

  for (const payment of payments) {
    if (!payment.proofImageUrl) continue;

    if (payment.proofImageUrl.includes('cloudinary.com')) {
      console.log(`Skipping already migrated: ${payment.id}`);
      continue;
    }

    const localPath = path.join(process.cwd(), payment.proofImageUrl);
    const result = await uploadLocalFile(localPath, 'payment-proofs');

    if (result) {
      await prisma.paymentRecord.update({
        where: { id: payment.id },
        data: {
          proofImageUrl: result.url,
          proofImagePublicId: result.publicId,
        },
      });
      console.log(`✓ Migrated payment proof for ${payment.id}`);
      migrated++;
    } else {
      console.error(`✗ Failed to migrate payment proof for ${payment.id}`);
      failed++;
    }
  }

  console.log(`Payment proofs migration: ${migrated} migrated, ${failed} failed`);
}

async function migrateUserAvatars() {
  console.log('Migrating user avatars...');
  
  const users = await prisma.user.findMany({
    where: {
      image: { not: null },
      imagePublicId: null,
    },
  });

  let migrated = 0;
  let failed = 0;
  let skipped = 0;

  for (const user of users) {
    if (!user.image) continue;

    if (user.image.includes('cloudinary.com') || user.image.startsWith('http')) {
      console.log(`Skipping external URL for user ${user.id}`);
      skipped++;
      continue;
    }

    const localPath = path.join(process.cwd(), user.image);
    const result = await uploadLocalFile(localPath, 'avatars');

    if (result) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          image: result.url,
          imagePublicId: result.publicId,
        },
      });
      console.log(`✓ Migrated avatar for user ${user.id}`);
      migrated++;
    } else {
      console.error(`✗ Failed to migrate avatar for user ${user.id}`);
      failed++;
    }
  }

  console.log(`User avatars migration: ${migrated} migrated, ${failed} failed, ${skipped} skipped`);
}

async function main() {
  console.log('Starting Cloudinary migration...\n');

  if (!process.env.CLOUDINARY_URL && (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)) {
    console.error('Error: Cloudinary credentials not found. Set CLOUDINARY_URL or individual credentials.');
    process.exit(1);
  }

  try {
    await migrateQrCodes();
    console.log('');
    await migratePaymentProofs();
    console.log('');
    await migrateUserAvatars();
    console.log('\nMigration completed!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
