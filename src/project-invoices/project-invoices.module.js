import { Module } from '@nestjs/common';
import { ProjectInvoicesController } from './project-invoices.controller';
import { ProjectInvoicesService } from './project-invoices.service';

@Module({
  controllers: [ProjectInvoicesController],
  providers: [ProjectInvoicesService],
})
export class ProjectInvoicesModule {}
