import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ViewsController } from './views.controller';
import { ViewsService } from './views.service';

@Module({
  imports: [PrismaModule],
  controllers: [ViewsController],
  providers: [ViewsService],
})
export class ViewsModule {}
