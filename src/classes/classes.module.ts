import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FavoritesModule } from '../favorites/favorites.module';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [PrismaModule, FavoritesModule],
  controllers: [ClassesController],
  providers: [ClassesService],
})
export class ClassesModule {}
