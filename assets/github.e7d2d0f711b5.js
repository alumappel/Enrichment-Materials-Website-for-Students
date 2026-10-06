import { assertData, applyChange, fetchJson } from './core.7afeeec32df5.js';

export class GitHubError extends Error {
  constructor(message, status = 0) { super(message); this.name = 'GitHubError'; this.status = status; }
}
export class ConflictError extends Error {
  constructor(latest) {
    super('המאגר השתנה מאז שנטען בעורך. הטופס נשמר במסך; טענו את הגרסה החדשה והחילו עליה את השינוי.');
    this.name = 'ConflictError'; this.latest = latest;
  }
}
export function validateConnection(config) {
  const errors = [];
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(config.owner || '')) errors.push('שם בעל המאגר אינו תקין');
  if (!/^[A-Za-z0-9_.-]+$/.test(config.repo || '')) errors.push('שם המאגר אינו תקין');
  if (!config.branch?.trim() || /[\s?\x00-\x1f]/.test(config.branch)) errors.push('נדרש שם ענף תקין');
  if (!config.path || config.path.startsWith('/') || config.path.split('/').some(part => !part || part === '.' || part === '..')) errors.push('נדרש נתיב יחסי לקובץ התכנים');
  try {
    const url = new URL(config.pagesUrl);
    if (url.protocol !== 'https:' || url.username || url.password || !url.pathname.endsWith('/')) throw new Error();
  } catch { errors.push('כתובת האתר חייבת להתחיל ב־https ולהסתיים ב־/'); }
  return errors;
}

export function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function base64ToUtf8(value) {
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(value.replace(/\s/g, '')), char => char.charCodeAt(0)));
}

export class GitHubClient {
  constructor(config, token, fetcher = fetch) {
    const errors = validateConnection(config);
    if (errors.length) throw new GitHubError(errors.join('\n'));
    if (!token) throw new GitHubError('הזינו מפתח גישה של GitHub לחיבור כתיבה');
    this.config = { ...config }; this.token = token; this.fetcher = fetcher;
    this.base = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
    this.file = `/contents/${config.path.split('/').map(encodeURIComponent).join('/')}`;
  }

  async request(path, options = {}) {
    const target = new URL(this.base + path);
    if (!options.method || options.method === 'GET') target.searchParams.set('_', `${Date.now()}-${crypto.randomUUID()}`);
    let response;
    try {
      response = await this.fetcher(target.href, {
        ...options, cache: 'no-store', signal: AbortSignal.timeout(25000),
        headers: {
          Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers
        }
      });
    } catch { throw new GitHubError('החיבור ל־GitHub נקטע או התעכב. התוכן נשאר בטופס. בדקו מצב לפני ניסיון נוסף.'); }
    if (!response.ok) {
      const messages = {
        401: 'מפתח הגישה אינו תקין או פג תוקפו. תקנו את החיבור.',
        403: 'GitHub דחה את הפעולה. בדקו הרשאות כתיבה, הגבלת ענף או מגבלת בקשות.',
        404: 'המאגר, הענף או קובץ התכנים לא נמצאו. בדקו גם את הרשאת המפתח למאגר.',
        409: 'הקובץ השתנה במאגר. יש לטעון את הגרסה העדכנית לפני ניסיון נוסף.',
        422: 'GitHub לא קיבל את העדכון. בדקו את הענף והנתיב בהגדרות.'
      };
      throw new GitHubError(messages[response.status] || `הפעולה ב־GitHub נכשלה (${response.status}). התוכן נשאר בטופס.`, response.status);
    }
    return response.json();
  }

  async read() {
    const file = await this.request(`${this.file}?ref=${encodeURIComponent(this.config.branch)}`);
    if (file.type !== 'file' || !file.sha) throw new GitHubError('הנתיב בהגדרות אינו קובץ JSON');
    const blob = file.encoding === 'base64' ? file : await this.request(`/git/blobs/${encodeURIComponent(file.sha)}`);
    if (blob.encoding !== 'base64' || typeof blob.content !== 'string') throw new GitHubError('לא ניתן לקרוא את תוכן הקובץ מ־GitHub');
    let parsed;
    try { parsed = JSON.parse(base64ToUtf8(blob.content)); }
    catch { throw new GitHubError('קובץ התכנים במאגר אינו JSON תקין'); }
    return { data: assertData(parsed), sha: file.sha };
  }

  async publish(change, expectedSha, onStage = () => {}) {
    onStage('בודקים את הגרסה העדכנית במאגר');
    const latest = await this.read();
    if (latest.data.revision === change.operationId) return { ...latest, recovered: true, commit: null };
    if (latest.sha !== expectedSha) throw new ConflictError(latest);
    const data = applyChange(latest.data, change);
    onStage('שומרים את השינוי במאגר');
    let result;
    try {
      result = await this.request(this.file, {
        method: 'PUT', body: JSON.stringify({
          message: `Publish enrichment ${change.operationId}`,
          content: utf8ToBase64(JSON.stringify(data, null, 2) + '\n'),
          sha: latest.sha, branch: this.config.branch
        })
      });
    } catch (error) {
      // The response may be lost after a successful write. Always inspect before retrying.
      let recovered;
      try { recovered = await this.read(); } catch { throw error; }
      if (recovered.data.revision === change.operationId) return { ...recovered, recovered: true, commit: null };
      if (recovered.sha !== latest.sha || error.status === 409) throw new ConflictError(recovered);
      throw error;
    }
    return { data, sha: result.content.sha, commit: result.commit.sha, recovered: false };
  }

  publicDataUrl() {
    const root = new URL(this.config.pagesUrl);
    // path is repository-relative, while Pages may be deployed from a subdirectory.
    return new URL('data/content.json', root).href;
  }

  async publicationStatus(revision, commit) {
    try {
      const data = await fetchJson(this.publicDataUrl(), { fetcher: this.fetcher, signal: AbortSignal.timeout(12000) });
      if (data.revision === revision) return { state: 'published', text: 'פורסם באתר' };
    } catch { /* A deploy can temporarily leave the public file unavailable. */ }
    if (commit) {
      try {
        const build = await this.request('/pages/builds/latest');
        if (build.commit === commit && build.status === 'errored') return { state: 'failed', text: 'השינוי נשמר במאגר, אך הפריסה לאתר נכשלה. בדקו את הפריסה ב־GitHub.' };
      } catch { /* GitHub Actions Pages sites do not always expose this legacy endpoint. */ }
      try {
        const runs = await this.request(`/actions/runs?head_sha=${encodeURIComponent(commit)}&per_page=20`);
        const pagesRun = runs.workflow_runs?.find(run => /pages|deploy/i.test(run.name || '') && run.head_sha === commit);
        if (pagesRun && ['failure', 'cancelled', 'timed_out', 'action_required'].includes(pagesRun.conclusion)) {
          return { state: 'failed', text: 'השינוי נשמר במאגר, אך הפריסה לאתר נכשלה. בדקו את הפריסה ב־GitHub.' };
        }
      } catch { /* Reading deployment metadata is optional; public revision is authoritative. */ }
    }
    return { state: 'pending', text: 'השינוי נשמר ועדיין לא אומת באתר' };
  }
}
