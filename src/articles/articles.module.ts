import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { ArticlesAdminController } from './articles-admin.controller';
import { ArticlesAdminService } from './articles-admin.service';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';

@Module({
  imports: [PrismaModule, CloudinaryModule],
  controllers: [ArticlesController, ArticlesAdminController],
  providers: [ArticlesService, ArticlesAdminService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
