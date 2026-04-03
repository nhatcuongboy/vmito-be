import { Module } from '@nestjs/common';
import { CategoryMatchesController } from './category-matches.controller';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [CategoriesModule],
  controllers: [CategoryMatchesController],
})
export class CategoryMatchesModule {}
