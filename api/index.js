const { createExpressApi } = require('../apps/api/dist/app.js');

let appPromise = null;

function getExpressApp() {
  if (!appPromise) {
    // A cold start that fails to reach Postgres or Redis must not poison the
    // instance: caching the rejected promise would replay the same failure for
    // every later request until the container is recycled.
    appPromise = createExpressApi({ serverless: true })
      .then((api) => api.app)
      .catch((error) => {
        appPromise = null;
        throw error;
      });
  }
  return appPromise;
}

module.exports = async function handler(request, response) {
  try {
    const app = await getExpressApp();
    app(request, response);
  } catch (error) {
    console.error(JSON.stringify({ message: 'API failed to initialize', error: error instanceof Error ? error.message : String(error) }));
    response.status(503).json({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'The API is starting up or a dependency is unavailable. Retry shortly.' } });
  }
};
