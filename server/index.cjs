const { createApp } = require('./app.cjs');
const { createProvider } = require('./provider.cjs');
const { createDemoProvider } = require('./demo.cjs');

const demo = process.argv.includes('--demo');
const port = Number(process.env.PORT || process.env.API_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT or API_PORT must be an integer between 1 and 65535.');
if (!demo && (!process.env.OPENWEATHER_API_KEY || !process.env.GEODB_API_KEY)) {
  console.error('Set OPENWEATHER_API_KEY and GEODB_API_KEY in .env, or run npm run demo.');
  process.exitCode = 1;
} else {
  const provider = demo ? createDemoProvider() : createProvider({ weatherKey: process.env.OPENWEATHER_API_KEY, geoKey: process.env.GEODB_API_KEY });
  const server = createApp({ provider }).listen(port, () => {
    console.log(`Weather API listening on port ${port} (${provider.mode} mode).`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 6000).unref();
    });
  }
}
