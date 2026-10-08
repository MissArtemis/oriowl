const http = require('node:http');

// Development only: Expo and FastAPI share the port already reached by Expo Go.
function apiGateway(port = 8787) {
  return (request, response, next) => {
    if (!/^\/(health(?:\?|$)|map(?:\/|\?|$)|api\/|_AMapService(?:\/|\?|$))/.test(request.url)) {
      return next();
    }
    // Log only explicit, read-only diagnostic probes. Never log tokens, full
    // query strings, photo bytes, credentials, or note contents.
    const diagnostic = request.method === 'GET' &&
      request.url.match(/[?&]owltraceDiagnostic=(xhr|fetch|api)(?:&|$)/)?.[1];
    if (diagnostic) {
      const path = request.url.split('?')[0];
      response.on('finish', () => console.log(
        `[OwlTrace diagnostic] ${diagnostic} GET ${path} -> ${response.statusCode} from ${request.socket.remoteAddress}`,
      ));
    }
    const upstream = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: request.url,
        method: request.method,
        headers: { ...request.headers, host: `127.0.0.1:${port}` },
      },
      (result) => {
        response.writeHead(result.statusCode, result.headers);
        result.pipe(response);
        result.on('error', () => response.destroy());
      },
    );
    upstream.on('error', () => {
      if (response.headersSent || response.destroyed) return response.destroy();
      response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ detail: 'FastAPI 尚未启动，请在电脑项目目录运行 npm run dev' }));
    });
    upstream.setTimeout(120000, () => upstream.destroy(new Error('API timeout')));
    request.on('aborted', () => upstream.destroy());
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
  };
}

module.exports = { apiGateway };
