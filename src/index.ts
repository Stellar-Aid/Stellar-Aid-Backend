/**
 * StellarAid Backend entrypoint.
 *
 * Wires the Express app: security (helmet), CORS, request logging (morgan),
 * JSON body parsing, the API routers, a health check, and — LAST — the
 * not-found and error handlers. Network config is validated on boot (fail fast).
 */
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { getNetworkConfig } from './config/network';
import { vaultsRouter } from './routes/vaults';
import { milestonesRouter } from './routes/milestones';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(morgan('combined'));
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'stellaraid-backend', time: new Date().toISOString() });
  });

  app.use('/api/vaults', vaultsRouter);
  app.use('/api/milestones', milestonesRouter);

  // Must be registered after all real routes.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();

// Only bind a port when run directly (not when imported by tests).
if (require.main === module) {
  // Fail fast: validate network config before accepting traffic.
  const config = getNetworkConfig();
  app.listen(config.port, () => {
    console.log(
      `StellarAid backend listening on :${config.port} (network=${config.network})`,
    );
  });
}

// TODO: Review performance constraints here (Ref: 4b45733e - 1784118695)
