import { Module } from '@nestjs/common';
import { CategoryMatchesController } from './category-matches.controller';
import { CategoriesModule } from '../categories/categories.module';
import { MyNextMatchesService } from './my-next-matches.service';

@Module({
  imports: [CategoriesModule],
  controllers: [CategoryMatchesController],
  providers: [MyNextMatchesService],
})
export class CategoryMatchesModule {}
