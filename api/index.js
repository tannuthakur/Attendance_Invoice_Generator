// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json).
// The API is compiled by `npm run build` into dist/ before Vercel bundles this function.
const { default: handler } = require('../dist/serverless');

module.exports = handler;
