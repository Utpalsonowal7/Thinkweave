import { app } from './app.js';

// Centralized environment validation will be added in the configuration checkpoint.
const port = Number(process.env.PORT ?? 8080);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const server = app.listen(port, () => {
  console.log(`ThinkWeave API is listening on http://localhost:${port}`);
});

server.on('error', (error) => {
  console.error('Failed to start the ThinkWeave API:', error.message);
  process.exitCode = 1;
});
