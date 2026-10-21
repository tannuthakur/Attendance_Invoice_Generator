import { Injectable } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { camelizeKeys } from '../utils/case';

/** Postgres rows are snake_case; the API speaks camelCase. */
@Injectable()
export class CamelCaseInterceptor {
  intercept(_context, next) {
    return next.handle().pipe(map((body) => camelizeKeys(body)));
  }
}
