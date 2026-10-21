import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { OwnershipGuard } from './common/guards/ownership.guard';
import { CamelCaseInterceptor } from './common/interceptors/camel-case.interceptor';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EmployeesModule } from './employees/employees.module';
import { ProjectsModule } from './projects/projects.module';
import { AttendanceModule } from './attendance/attendance.module';
import { HolidaysModule } from './holidays/holidays.module';
import { SalariesModule } from './salaries/salaries.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ProjectInvoicesModule } from './project-invoices/project-invoices.module';
import { OptionsModule } from './options/options.module';
import { ConfigModule } from './config.module';

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    SupabaseModule,
    AuthModule,
    UsersModule,
    EmployeesModule,
    ProjectsModule,
    AttendanceModule,
    HolidaysModule,
    SalariesModule,
    InvoicesModule,
    ProjectInvoicesModule,
    OptionsModule,
  ],
  providers: [
    // Guards run in this order.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: OwnershipGuard },
    { provide: APP_INTERCEPTOR, useClass: CamelCaseInterceptor },
  ],
})
export class AppModule {}
