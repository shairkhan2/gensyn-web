const express = require('express');
const path = require('path');

// Lazy import node-fetch (v3 is ESM-only)
const fetchFn = async (...args) => {
  const mod = await import('node-fetch');
  return mod.default(...args);
};

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from current directory (contains index.html)
app.use(express.static(__dirname));

// Support extensionless HTML routes (e.g., /card → card.html)
app.get('/:page', (req, res, next) => {
  const page = (req.params.page || '').trim();
  if (!page) return next();
  const candidate = path.join(__dirname, `${page}.html`);
  return res.sendFile(candidate, (err) => {
    if (err) return next();
  });
});

// Simple JSON proxy to avoid CORS issues
app.get('/api/proxy', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  const decodedUrl = decodeURIComponent(url);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s

    const response = await fetchFn(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'Upstream error', status: response.status, body: text.slice(0, 300) });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      return res.status(500).json({ error: 'Expected JSON', contentType, body: text.slice(0, 300) });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Proxy failed', details: err.message, url: decodedUrl });
  }
});

// Fallback to index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
});


