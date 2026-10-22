import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const children = [];
function stop() { for (const child of children) child.kill(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
for (const args of [
  ['--env-file-if-exists=.env.local', '--experimental-strip-types', 'server/index.ts'],
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'],
]) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, VITE_DATA_MODE: 'api', VITE_API_BASE_URL: '/api', API_PROXY_TARGET: 'http://127.0.0.1:3000' } });
  children.push(child);
  child.on('exit', code => { stop(); process.exitCode = code || 0; });
  child.on('error', () => { console.error('Не удалось запустить локальную CRM'); stop(); process.exitCode = 1; });
}
