import { resolve } from 'node:path';
import { Store } from './store.ts';
import { InstagramIntegration, MetaClient } from './instagram.ts';
import { createInstagramGateway, createLocalApi } from './http.ts';

const apiPort = Number(process.env.API_PORT || 3000), gatewayPort = Number(process.env.INSTAGRAM_GATEWAY_PORT || 3001);
const frontendOrigin = process.env.CRM_ORIGIN || 'http://localhost:5173';
if (!['http://localhost:5173', 'http://127.0.0.1:5173'].includes(frontendOrigin)) throw new Error('CRM_ORIGIN должен указывать на локальную CRM на порту 5173');
const store = new Store(resolve(process.env.CRM_DATA_DIR || '.data'));
const instagram = new InstagramIntegration(store, new MetaClient(process.env.INSTAGRAM_API_VERSION || 'v24.0'));
const api = createLocalApi(store, instagram, ['http://localhost:5173', 'http://127.0.0.1:5173']);
const gateway = createInstagramGateway(instagram, frontendOrigin);
api.on('error', error => { console.error('Не удалось запустить локальный API:', error.message); process.exit(1); });
gateway.on('error', error => { console.error('Не удалось запустить приёмник Instagram:', error.message); process.exit(1); });
api.listen(apiPort, '127.0.0.1', () => console.log(`CRM API: http://127.0.0.1:${apiPort}`));
gateway.listen(gatewayPort, '127.0.0.1', () => console.log(`Приёмник Instagram: http://127.0.0.1:${gatewayPort} (для HTTPS-туннеля)`));
const timer = setInterval(() => { void instagram.tick().catch(() => console.error('Не удалось обработать события Instagram. Они сохранены для повторной попытки.')); }, 2000);
function stop() {
  clearInterval(timer); api.close(); gateway.close();
  // Allow in-flight Graph calls to finish before closing SQLite.
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
