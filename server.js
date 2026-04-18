

const express = require('express');
const cors    = require('cors');
const fetch   = (...args) => import('node-fetch').then(m => m.default(...args));

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());                        // allow your Flutter app's origin
app.use(express.json({ limit: '15mb' })); // screenshots can be a few MB


function checkSecret(req, res, next) {
  const secret = process.env.APP_SECRET;
  if (secret && req.headers['x-app-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  next();
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));


app.post('/analyse', checkSecret, async (req, res) => {
  const { image } = req.body;

  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing "image" field (base64 PNG).' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY env var is not set!');
    return res.status(500).json({ error: 'Server misconfiguration.' });
  }

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content: `You are an expert fact-checker and content analyst. The user has captured a screenshot from their device screen (e.g. from Instagram, Twitter/X, news apps, messaging apps, or websites).

Your task is to:
1. Describe what is visible in the screenshot (post, article, profile, message, etc.)
2. Assess whether the content appears real/authentic or potentially fake, misleading, manipulated, or satirical
3. Highlight any red flags (unverified claims, suspicious statistics, edited images, sensational language, unusual formatting, lack of sources)
4. Note any verifiable context (known public figures, organisations, brands)
5. Give a clear final verdict: "Likely authentic", "Uncertain – verify independently", or "Likely misleading / fake"

Keep your response concise (under 200 words), clear, and structured. Lead with the most important finding.`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${image}`,
                  detail: 'high',
                },
              },
              {
                type: 'text',
                text: 'Analyse this screenshot. Is the content real, fake, or misleading? Provide key details.',
              },
            ],
          },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.json().catch(() => ({}));
      const msg = err?.error?.message ?? `OpenAI error ${openaiRes.status}`;
      console.error('OpenAI error:', msg);
      return res.status(502).json({ error: msg });
    }

    const data     = await openaiRes.json();
    const analysis = data.choices?.[0]?.message?.content?.trim() ?? '';
    return res.json({ analysis });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Internal proxy error.' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Screen Checker proxy listening on port ${PORT}`);
});
