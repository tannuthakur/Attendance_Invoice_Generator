import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

function flatten(errors, parent = '') {
  return errors.flatMap((err) => {
    const path = parent ? `${parent}.${err.property}` : err.property;
    const own = Object.values(err.constraints || {}).map((msg) =>
      parent ? msg.replace(err.property, path) : msg,
    );
    return own.concat(flatten(err.children || [], path));
  });
}

/**
 * Babel does not emit `design:paramtypes`, so Nest's ValidationPipe cannot infer DTO classes.
 * This pipe takes the DTO class explicitly: `@Bind(Body(validated(CreateEmployeeDto)))`.
 * Behaves like ValidationPipe({ transform, whitelist, forbidNonWhitelisted }).
 */
export class DtoValidationPipe {
  constructor(dto) {
    this.dto = dto;
  }

  async transform(value) {
    const instance = plainToInstance(this.dto, value ?? {}, { enableImplicitConversion: false });
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) throw new BadRequestException(flatten(errors));
    return instance;
  }
}

export const validated = (dto) => new DtoValidationPipe(dto);
