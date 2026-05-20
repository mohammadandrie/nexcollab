// AI image generation proxy — calls Hermes gateway /v1/images/generations
// (model: canva/image) and saves result under data/uploads/.
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { LLM_BASE_URL, LLM_API_KEY, UPLOADS_DIR } from '../config.js';
import { requireAuth } from '../auth.js';

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const router = Router();

router.post('/ai/image', requireAuth, async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ detail: 'prompt_required' });

    const r = await fetch(`${LLM_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'canva/image',
        prompt,
        n: 1,
        size: req.body?.size || '1024x1024',
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (r.status === 503) {
      return res.status(503).json({
        detail: 'image_service_unavailable',
        message: 'Image generation upstream is offline.',
      });
    }
    if (!r.ok) {
      const txt = await r.text();
      return res.status(502).json({
        detail: 'gateway_error', status: r.status,
        message: txt.slice(0, 300),
      });
    }

    const data = await r.json();
    const item = data?.data?.[0];
    if (!item) return res.status(502).json({ detail: 'no_image_returned' });

    const id = crypto.randomBytes(8).toString('hex');
    const filename = `ai-${Date.now()}-${id}.png`;
    const fullPath = path.join(UPLOADS_DIR, filename);

    if (item.b64_json) {
      fs.writeFileSync(fullPath, Buffer.from(item.b64_json, 'base64'));
    } else if (item.url) {
      const img = await fetch(item.url, { signal: AbortSignal.timeout(60_000) });
      if (!img.ok) return res.status(502).json({ detail: 'image_fetch_failed' });
      const buf = Buffer.from(await img.arrayBuffer());
      fs.writeFileSync(fullPath, buf);
    } else {
      return res.status(502).json({ detail: 'unknown_image_payload' });
    }

    const stat = fs.statSync(fullPath);
    res.json({
      ok: true,
      file: {
        url: `/uploads/${filename}`,
        name: `ai-${id}.png`,
        mime: 'image/png',
        size: stat.size,
      },
    });
  } catch (e) { next(e); }
});

export default router;
