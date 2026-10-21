import { Controller, Dependencies, Get, Post, Patch, Delete, Body, Param, Query, Bind, HttpCode, ParseUUIDPipe, StreamableFile } from '@nestjs/common';
import { ProjectInvoicesService } from './project-invoices.service';
import { CreateProjectInvoiceDto, ListProjectInvoicesQuery, RenumberProjectInvoiceDto, MarkPaidDto } from './project-invoices.dto';
import { Permission, CurrentUser } from '../common/decorators';
import { validated } from '../common/validation.pipe';

@Controller('project-invoices')
@Dependencies(ProjectInvoicesService)
export class ProjectInvoicesController {
  constructor(invoices) {
    this.invoices = invoices;
  }

  @Post()
  @Permission('invoices:write')
  @Bind(Body(validated(CreateProjectInvoiceDto)), CurrentUser())
  create(dto, user) {
    return this.invoices.create(dto, user);
  }

  @Post('preview')
  @Permission('invoices:write')
  @HttpCode(200)
  @Bind(Body(validated(CreateProjectInvoiceDto)))
  preview(dto) {
    return this.invoices.preview(dto);
  }

  @Post('preview/pdf')
  @Permission('invoices:write')
  @HttpCode(200)
  @Bind(Body(validated(CreateProjectInvoiceDto)))
  async draftPdf(dto) {
    const { buffer, fileName } = await this.invoices.draftPdf(dto);
    return new StreamableFile(buffer, { type: 'application/pdf', disposition: `attachment; filename="${fileName}"` });
  }

  @Get('next-number')
  @Permission('invoices:write')
  async nextNumber() {
    return { invoiceNumber: await this.invoices.nextInvoiceNumber() };
  }

  @Patch(':id')
  @Permission('invoices:write')
  @Bind(Param('id', ParseUUIDPipe), Body(validated(RenumberProjectInvoiceDto)))
  renumber(id, dto) {
    return this.invoices.renumber(id, dto);
  }

  @Get()
  @Permission('invoices:read')
  @Bind(Query(validated(ListProjectInvoicesQuery)))
  list(query) {
    return this.invoices.list(query);
  }

  @Get(':id')
  @Permission('invoices:read')
  @Bind(Param('id', ParseUUIDPipe))
  findOne(id) {
    return this.invoices.findOne(id);
  }

  @Get(':id/pdf')
  @Permission('invoices:read')
  @Bind(Param('id', ParseUUIDPipe), Query('download'))
  pdf(id, download) {
    return this.invoices.pdfUrl(id, { download: download === '1' || download === 'true' });
  }

  @Delete(':id')
  @Permission('invoices:delete')
  @Bind(Param('id', ParseUUIDPipe))
  remove(id) {
    return this.invoices.remove(id);
  }

  @Post(':id/pay')
  @Permission('invoices:write')
  @HttpCode(200)
  @Bind(Param('id', ParseUUIDPipe), Body(validated(MarkPaidDto)), CurrentUser())
  markPaid(id, dto, user) {
    return this.invoices.markPaid(id, dto, user);
  }

  @Post(':id/unpay')
  @Permission('invoices:write')
  @HttpCode(200)
  @Bind(Param('id', ParseUUIDPipe))
  markUnpaid(id) {
    return this.invoices.markUnpaid(id);
  }

  @Post(':id/void')
  @Permission('invoices:write')
  @HttpCode(200)
  @Bind(Param('id', ParseUUIDPipe), CurrentUser())
  void(id, user) {
    return this.invoices.void(id, user);
  }
}
