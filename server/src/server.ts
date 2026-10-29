import 'dotenv/config';
import { createServer } from 'node:http';
import { attachRealtime } from './modules/realtime/realtime.js';
import { drainRooms } from './modules/realtime/rooms.js';
import { app } from './app.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { accessSecret } from './modules/auth/tokens.js';

accessSecret();

const port = Number(process.env.PORT ?? 8080);

const server = createServer(app);
const io = attachRealtime(server);
server.listen(port, () => {
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
  const timeout = setTimeout(() => {
    console.error('Shutdown timed out');
    process.exit(1);
  }, 15000);
  timeout.unref();
  io.close(async () => {
    try {
      await drainRooms();
      await prisma.$disconnect();
    } catch {
      console.error('Shutdown failed');
      process.exitCode = 1;
    } finally {
      redis.disconnect();
      clearTimeout(timeout);
    }
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
