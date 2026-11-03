import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AppUpdatePolicyController } from './app-update-policy.controller';
import { AppUpdatePolicyService } from './app-update-policy.service';

@Module({
  imports: [PrismaModule],
  controllers: [AppUpdatePolicyController],
  providers: [AppUpdatePolicyService],
})
export class AppUpdatePolicyModule {}
