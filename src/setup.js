import helmet from 'helmet';
import { APP_CONFIG } from './common/tokens';

/** Middleware and settings shared by the local server (main.js) and the Vercel function (serverless.js). */
export function configureApp(app) {
  const config = app.get(APP_CONFIG);
  if (config.trustProxy) app.getHttpAdapter().getInstance().set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.enableCors({ origin: config.corsOrigins.length ? config.corsOrigins : false, credentials: true });
  app.setGlobalPrefix('api/v1');
  return config;
}
