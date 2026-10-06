import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let hide = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!hide) process.stdout.write(chunk); callback(); } });
const prompt = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
try {
  const username = (await prompt.question('Username: ')).trim();
  process.stdout.write('Password (hidden): '); hide = true;
  const password = await prompt.question(''); hide = false; process.stdout.write('\n');
  if (!username || !password) throw new Error('Username and password are required');
  const config = JSON.parse(await readFile(resolve(root, 'config.json'), 'utf8'));
  const salt = randomBytes(16).toString('hex');
  config.login = { username, salt, passwordHash: createHash('sha256').update(`${salt}:${password}`).digest('hex') };
  await writeFile(resolve(root, 'config.json'), JSON.stringify(config, null, 2) + '\n');
  console.log('Login settings updated. The browser checks this convenience gate; GitHub token controls write permission.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { hide = false; prompt.close(); }
