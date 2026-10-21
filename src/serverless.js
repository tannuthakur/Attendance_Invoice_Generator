import 'reflect-metadata';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './setup';

// One Nest app per warm function instance; created on the first request.
let server;

export async function getServer() {
  if (!server) {
    const instance = express();
    const app = await NestFactory.create(AppModule, new ExpressAdapter(instance), { logger: ['error', 'warn'] });
    configureApp(app);
    await app.init();
    server = instance;
  }
  return server;
}

/** Vercel / Node request handler. */
export default async function handler(req, res) {
  const app = await getServer();
  return app(req, res);
}
