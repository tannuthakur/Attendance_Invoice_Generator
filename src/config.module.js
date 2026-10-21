import { Global, Module } from '@nestjs/common';
import { loadConfig } from './config';
import { APP_CONFIG } from './common/tokens';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
