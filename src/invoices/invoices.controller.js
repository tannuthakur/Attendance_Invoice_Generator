import { Controller, Dependencies, Get, Post, Delete, Body, Param, Query, Bind, HttpCode, ParseUUIDPipe } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto, ListInvoicesQuery, MarkPaidDto } from './invoices.dto';
import { Permission, CurrentUser } from '../common/decorators';
import { validated } from '../common/validation.pipe';

@Controller('invoices')
@Dependencies(InvoicesService)
export class InvoicesController {
  constructor(invoices) {
    this.invoices = invoices;
  }

  @Post()
  @Permission('invoices:write')
  @Bind(Body(validated(CreateInvoiceDto)), CurrentUser())
  create(dto, user) {
    return this.invoices.create(dto, user);
  }

  @Post('preview')
  @Permission('invoices:write')
  @HttpCode(200)
  @Bind(Body(validated(CreateInvoiceDto)))
  preview(dto) {
    return this.invoices.preview(dto);
  }

  @Get()
  @Permission('invoices:read')
  @Bind(Query(validated(ListInvoicesQuery)))
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
