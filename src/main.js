import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { APP_CONFIG } from './common/tokens';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(APP_CONFIG);

  if (config.trustProxy) app.getHttpAdapter().getInstance().set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.enableCors({ origin: config.corsOrigins.length ? config.corsOrigins : false, credentials: true });
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  await app.listen(config.port);
  Logger.log(`API listening on http://localhost:${config.port}/api/v1`, 'Bootstrap');
}

bootstrap();
