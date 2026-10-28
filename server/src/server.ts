import 'dotenv/config';
import { app } from './app.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';

const port = Number(process.env.PORT ?? 8080);

const server = app.listen(port, () => {
  console.log(`ThinkWeave API is listening on http://localhost:${port}`);
});
server.on('error', (error) => {
  console.error('Failed to start the ThinkWeave API:', error.message);
  process.exitCode = 1;
});

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(async (error) => {
    if (error) console.error('HTTP shutdown failed:', error.message);
    redis.disconnect();
    await prisma.$disconnect();
    process.exitCode = error ? 1 : 0;
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
