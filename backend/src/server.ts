import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { app } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './db/prisma';
import { startScheduler } from './jobs/scheduler';

function createServer(): http.Server | https.Server {
  const certPath = process.env.TLS_CERT_PATH;
  const keyPath = process.env.TLS_KEY_PATH;

  // Production TLS terminates at nginx (see docker-compose.prod.yml). Direct
  // Node TLS is for local development/testing only.
  if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    logger.info({ certPath }, 'Starting API with TLS');
    return https.createServer(
      { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
      app,
    );
  }

  return http.createServer(app);
}

const server = createServer();
const stopScheduler = startScheduler();

server.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      tls: server instanceof https.Server,
      publicRegistration: env.ENABLE_PUBLIC_REGISTRATION,
    },
    'TeamBoard API listening',
  );
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down gracefully');

  const forceExit = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  stopScheduler();

  server.close(async (error) => {
    if (error) logger.error({ err: error }, 'Error while closing HTTP server');
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      logger.error({ err: disconnectError }, 'Error while disconnecting Prisma');
    }
    clearTimeout(forceExit);
    process.exit(error ? 1 : 0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception — exiting');
  process.exit(1);
});
