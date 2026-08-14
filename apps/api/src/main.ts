import { createExpressApi } from './app';

async function bootstrap(): Promise<void> {
  const api = await createExpressApi();
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
  const server = api.app.listen(port, '0.0.0.0');
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await api.close();
      process.exit(0);
    } catch (error) {
      console.error(JSON.stringify({ message: 'API failed during shutdown', error: error instanceof Error ? error.message : String(error) }));
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  console.info(JSON.stringify({ message: 'API started', port }));
}

void bootstrap().catch((error: unknown) => {
  console.error(JSON.stringify({ message: 'API failed to start', error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
