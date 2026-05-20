// Public GitHub proxy — list branches for a repo (no auth, public repos only).
import { Router } from 'express';
import { requireAuth } from '../auth.js';

const router = Router();

router.get('/github/branches', requireAuth, async (req, res, next) => {
  try {
    const repo = String(req.query.repo || '').trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      return res.status(400).json({ detail: 'invalid_repo' });
    }
    const r = await fetch(
      `https://api.github.com/repos/${repo}/branches?per_page=100`,
      { headers: { 'Accept': 'application/vnd.github+json',
                   'User-Agent': 'nexcollab' } },
    );
    if (r.status === 404) return res.status(404).json({ detail: 'repo_not_found' });
    if (r.status === 403) return res.status(403).json({ detail: 'rate_limited' });
    if (!r.ok) return res.status(502).json({ detail: 'github_error', status: r.status });
    const data = await r.json();
    res.json({
      branches: data.map((b) => ({ name: b.name, sha: b.commit?.sha })),
    });
  } catch (e) { next(e); }
});

export default router;
