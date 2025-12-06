const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3003;

// Serve built assets from /dist under /dist, then static assets from /public
app.use('/dist', express.static(path.join(__dirname, 'dist')));
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index for any unmatched route
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Export for Vercel (serverless) and listen when run locally
module.exports = app;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MNSTR EV dashboard available at http://localhost:${PORT}`);
  });
}
