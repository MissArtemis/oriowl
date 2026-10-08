const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const { apiGateway } = require('./scripts/apiGateway.cjs');

const config = getDefaultConfig(__dirname);
// The mobile app and FastAPI read the same product limits.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../config')];
const original = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const metro = original ? original(middleware, server) : middleware;
  const gateway = apiGateway();
  return (request, response, next) => gateway(request, response, () => metro(request, response, next));
};
module.exports = config;
