// Headless screenshot helper. Saves PNG under data/uploads/.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { UPLOADS_DIR } from './config.js';

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let _browser = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  return _browser;
}

function normalizeUrl(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) return `https://${t}`;
  return t;
}

/**
 * Take a screenshot of `url`. Returns {url, name, mime, size} on success
 * (same shape as uploads), or throws.
 */
export async function captureUrl(rawUrl, { timeoutMs = 25_000 } = {}) {
  const url = normalizeUrl(rawUrl);
  if (!url) throw new Error('invalid_url');

  const browser = await getBrowser();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/148.0.0.0 Safari/537.36 nexcollab-screenshot',
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
  } catch {
    // Fall back to less strict load condition for slow / always-streaming pages.
    await page.goto(url, { waitUntil: 'load', timeout: timeoutMs }).catch(() => {});
  }

  const id = crypto.randomBytes(6).toString('hex');
  const filename = `ss-${Date.now()}-${id}.png`;
  const fullPath = path.join(UPLOADS_DIR, filename);
  await page.screenshot({ path: fullPath, fullPage: false });

  await ctx.close();
  const stat = fs.statSync(fullPath);
  return {
    url: `/uploads/${filename}`,
    name: `screenshot-${new URL(url).hostname}.png`,
    mime: 'image/png',
    size: stat.size,
    source_url: url,
  };
}
