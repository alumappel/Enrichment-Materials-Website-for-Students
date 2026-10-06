import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GitHubClient, ConflictError, utf8ToBase64, base64ToUtf8, validateConnection } from '../src/github.mjs';
import { applyChange } from '../src/core.mjs';

const sample = () => JSON.parse(readFileSync(new URL('../data/content.json', import.meta.url), 'utf8'));
const config = { owner: 'lecturer', repo: 'enrichment', branch: 'main', path: 'data/content.json', pagesUrl: 'https://lecturer.github.io/enrichment/' };
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
test.beforeEach(t => { t.mock.method(console, 'warn', () => {}); });
function mockRepo({ loseResponse = false, putStatus = 200 } = {}) {
  let data = sample(), sha = 'initial-sha', writes = 0, reads = 0;
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'PUT') {
      writes++; const body = JSON.parse(options.body);
      if (body.sha !== sha) return response({}, 409);
      if (putStatus !== 200) return response({}, putStatus);
      data = JSON.parse(base64ToUtf8(body.content)); sha = 'saved-sha';
      if (loseResponse) throw new Error('Response lost');
      return response({ content: { sha }, commit: { sha: 'commit-one' } });
    }
    reads++;
    return response({ type: 'file', sha, encoding: 'base64', content: utf8ToBase64(JSON.stringify(data)) });
  };
  return { fetcher, calls, replace(newData, newSha) { data = newData; sha = newSha; }, get data() { return data; }, get writes() { return writes; }, get reads() { return reads; } };
}
const change = data => ({ kind: 'item', value: { ...data.items[0], title: 'כותרת חדשה בעברית' }, operationId: 'fixed-operation', timestamp: '2026-10-05T10:00:00Z' });

test('Unicode JSON round trips without corrupting Hebrew, emoji, or a large file', () => {
  const value = 'עברית 🧩 '.repeat(150000);
  assert.equal(base64ToUtf8(utf8ToBase64(value)), value);
});
test('connection rejects non-HTTPS Pages URLs, relative traversal and invalid repository values', () => {
  assert.equal(validateConnection(config).length, 0);
  assert.ok(validateConnection({ ...config, pagesUrl: 'http://example.org/', path: '../data.json', owner: 'bad/owner' }).length >= 3);
  assert.throws(() => new GitHubClient(config, ''));
});
test('publish reads latest SHA and writes exactly one combined JSON with the operation revision', async () => {
  const mock = mockRepo(); const client = new GitHubClient(config, 'fake-test-token', mock.fetcher);
  const original = await client.read(); const stages = [];
  const result = await client.publish(change(original.data), original.sha, stage => stages.push(stage));
  assert.equal(mock.writes, 1); assert.equal(mock.reads, 2); assert.equal(result.data.revision, 'fixed-operation');
  assert.equal(result.data.items.length, original.data.items.length); assert.equal(result.data.items[0].addedAt, original.data.items[0].addedAt);
  const put = mock.calls.find(call => call.options.method === 'PUT');
  assert.equal(put.options.headers.Authorization, 'Bearer fake-test-token');
  assert.equal(JSON.parse(put.options.body).sha, original.sha); assert.equal(stages.length, 2);
  assert.ok(mock.calls.every(call => !call.url.includes('fake-test-token')));
});
test('an old tab detects conflict before writing and exposes latest data for explicit reapplication', async () => {
  const mock = mockRepo(); const client = new GitHubClient(config, 'fake', mock.fetcher);
  const original = await client.read(); const newer = { ...original.data, revision: 'other-tab' };
  mock.replace(newer, 'other-sha');
  await assert.rejects(() => client.publish(change(original.data), original.sha), error => error instanceof ConflictError && error.latest.data.revision === 'other-tab');
  assert.equal(mock.writes, 0);
});
test('a lost successful PUT response is recovered, and retry never duplicates or writes again', async () => {
  const mock = mockRepo({ loseResponse: true }); const client = new GitHubClient(config, 'fake', mock.fetcher);
  const original = await client.read(); const operation = change(original.data);
  const result = await client.publish(operation, original.sha);
  assert.equal(result.recovered, true); assert.equal(mock.writes, 1);
  const retried = await client.publish(operation, original.sha);
  assert.equal(retried.recovered, true); assert.equal(mock.writes, 1);
  assert.equal(mock.data.items.length, original.data.items.length);
});
test('a racing write between GET and PUT fails without overwriting newer content', async () => {
  const initial = sample(); let saved = initial, writes = 0;
  const fetcher = async (_url, options) => {
    if (options.method === 'PUT') { writes++; saved = { ...initial, revision: 'racing-tab' }; return response({}, 409); }
    return response({ type: 'file', sha: saved === initial ? 'before' : 'after', encoding: 'base64', content: utf8ToBase64(JSON.stringify(saved)) });
  };
  const client = new GitHubClient(config, 'fake', fetcher);
  await assert.rejects(() => client.publish(change(initial), 'before'), ConflictError);
  assert.equal(writes, 1); assert.equal(saved.revision, 'racing-tab');
});
test('a rejected authorization gives a Hebrew error without leaking the token', async () => {
  const client = new GitHubClient(config, 'super-secret-test', async () => response({}, 401));
  await assert.rejects(() => client.read(), error => error.status === 401 && error.message.includes('מפתח') && !error.message.includes('super-secret-test'));
});
test('public revision, not a successful repository commit, determines published status', async () => {
  const client = new GitHubClient(config, 'fake', async url => {
    if (url.startsWith(config.pagesUrl)) return response({ revision: 'old-version' });
    return response({}, 403);
  });
  assert.equal((await client.publicationStatus('new-version', 'commit-one')).state, 'pending');
  client.fetcher = async () => response({ revision: 'new-version' });
  assert.equal((await client.publicationStatus('new-version', 'commit-one')).state, 'published');
});
test('deployment failure is distinct from a save failure and from a pending deploy', async () => {
  const client = new GitHubClient(config, 'fake', async url => {
    if (url.startsWith(config.pagesUrl)) return response({ revision: 'old-version' });
    if (url.includes('/pages/builds/latest')) return response({ commit: 'commit-one', status: 'errored' });
    return response({}, 403);
  });
  const status = await client.publicationStatus('new-version', 'commit-one');
  assert.equal(status.state, 'failed'); assert.ok(status.text.includes('נשמר במאגר'));
});
test('files over the Contents API inline-content limit are read using the blob endpoint', async () => {
  const data = sample();
  const client = new GitHubClient(config, 'fake', async url => url.includes('/git/blobs/') ?
    response({ encoding: 'base64', content: utf8ToBase64(JSON.stringify(data)) }) :
    response({ type: 'file', sha: 'large-blob-sha', encoding: 'none', content: '' }));
  assert.equal((await client.read()).data.revision, data.revision);
});

test('connection rejects whitespace, hidden characters and non-ASCII token text before sending a request', () => {
  let requests = 0;
  for (const token of ['שם המפתח', 'github_pat_abc def', 'github_pat_abc\ndef', 'github_pat_abc\u200bdef']) {
    assert.throws(() => new GitHubClient(config, token, async () => { requests++; }), error =>
      error.code === 'INVALID_TOKEN_FORMAT' && !error.message.includes(token));
  }
  assert.equal(requests, 0);
});
test('connection works when the browser has no AbortSignal.timeout method', async () => {
  const original = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
  Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
  try {
    const mock = mockRepo();
    const client = new GitHubClient(config, 'fake', mock.fetcher);
    const result = await client.read();
    assert.equal(result.sha, 'initial-sha');
    assert.ok(mock.calls[0].options.signal instanceof AbortSignal);
    client.fetcher = async () => response({ revision: 'published-without-native-timeout' });
    assert.equal((await client.publicationStatus('published-without-native-timeout', null)).state, 'published');
  } finally {
    if (original) Object.defineProperty(AbortSignal, 'timeout', original);
    else delete AbortSignal.timeout;
  }
});
test('network failure records useful diagnostics without exception text, token or request contents', async () => {
  const secret = 'super-secret-test-token';
  const client = new GitHubClient(config, secret, async () => { throw new TypeError(`Headers failed: ${secret}`); });
  await assert.rejects(() => client.read(), error => {
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.equal(error.diagnostics.cause, 'TypeError');
    assert.equal(error.diagnostics.phase, 'fetch');
    assert.ok(!error.message.includes(secret));
    return true;
  });
  const logged = console.warn.mock.calls.map(call => call.arguments);
  assert.equal(logged.length, 1);
  assert.ok(!JSON.stringify(logged).includes(secret));
  assert.ok(!JSON.stringify(logged).includes('Authorization'));
  assert.equal(logged[0][1].method, 'GET');
});
test('offline errors are distinct from failures with an apparently available network', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  try {
    const client = new GitHubClient(config, 'fake', async () => { throw new TypeError('Failed to fetch'); });
    await assert.rejects(() => client.read(), error => error.code === 'OFFLINE' && error.message.includes('אין חיבור'));
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  }
});
test('request timeout aborts a pending connection and emits timeout diagnostics', async () => {
  const client = new GitHubClient(config, 'fake', async (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Request aborted', 'AbortError')), { once: true });
  }), { timeoutMs: 10 });
  await assert.rejects(() => client.read(), error => error.code === 'TIMEOUT' && error.diagnostics.phase === 'fetch');
  assert.equal(console.warn.mock.calls[0].arguments[1].code, 'TIMEOUT');
});
test('the timeout also protects reading a response body after successful headers', async () => {
  const client = new GitHubClient(config, 'fake', async (_url, options) => ({
    ok: true, status: 200,
    json: () => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Body aborted', 'AbortError')), { once: true });
    })
  }), { timeoutMs: 10 });
  await assert.rejects(() => client.read(), error => error.code === 'TIMEOUT' && error.diagnostics.phase === 'response');
});
test('invalid JSON and interrupted response bodies have separate, sanitized diagnostics', async () => {
  for (const [failure, expected] of [[new SyntaxError('secret response text'), 'INVALID_RESPONSE'], [new TypeError('secret response text'), 'RESPONSE_READ_ERROR']]) {
    const client = new GitHubClient(config, 'fake', async () => ({ ok: true, status: 200, json: async () => { throw failure; } }));
    await assert.rejects(() => client.read(), error => error.code === expected && !error.message.includes('secret response text'));
  }
  assert.ok(!JSON.stringify(console.warn.mock.calls.map(call => call.arguments)).includes('secret response text'));
});
test('successful requests clear their timeout instead of aborting a completed connection', async () => {
  const mock = mockRepo();
  await new GitHubClient(config, 'fake', mock.fetcher, { timeoutMs: 10 }).read();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(mock.calls[0].options.signal.aborted, false);
});
