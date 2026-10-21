import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = configureApp(app);
  app.enableShutdownHooks();

  await app.listen(config.port);
  Logger.log(`API listening on http://localhost:${config.port}/api/v1`, 'Bootstrap');
}

bootstrap();
