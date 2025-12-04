const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3003;

// Serve everything in the repo root (index.html, assets)
app.use(express.static(path.join(__dirname)));

// Fallback to index for any unmatched route
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MNSTR EV dashboard available at http://localhost:${PORT}`);
});
