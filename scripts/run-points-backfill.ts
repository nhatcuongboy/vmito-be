import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PointsBackfillService } from '../src/points/points-backfill.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const backfill = app.get(PointsBackfillService);
  const result = await backfill.backfillAll();
  console.log('Backfill result:', JSON.stringify(result));
  await app.close();
}

void main();
