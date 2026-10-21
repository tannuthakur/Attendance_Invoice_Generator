import { Injectable, Dependencies } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { APP_CONFIG } from '../common/tokens';
import { unwrap } from '../common/utils/db';
import { monthToDate } from '../common/utils/dates';

@Injectable()
@Dependencies(SupabaseService, APP_CONFIG)
export class SalariesService {
  constructor(supabase, config) {
    this.db = supabase.admin;
    this.config = config;
  }

  /** Adds (or replaces) the salary effective from the given month. */
  async create({ employeeId, month, monthlyAmount, currency }, actor) {
    return unwrap(
      await this.db
        .from('salaries')
        .upsert(
          {
            employee_id: employeeId,
            effective_month: monthToDate(month),
            monthly_amount: monthlyAmount,
            currency: (currency || this.config.invoices.defaultCurrency).toUpperCase(),
            created_by: actor.id,
          },
          { onConflict: 'employee_id,effective_month' },
        )
        .select()
        .single(),
    );
  }

  async list({ employeeId }) {
    return unwrap(
      await this.db
        .from('salaries')
        .select('*')
        .eq('employee_id', employeeId)
        .order('effective_month', { ascending: false }),
    );
  }
}
