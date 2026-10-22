import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { leadSchema } from '../src/lib/domain.ts';
import type { Lead } from '../src/lib/domain.ts';

export class Store {
  db: DatabaseSync;
  private key: Buffer;

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    const keyPath = join(directory, 'key');
    if (!existsSync(keyPath) && existsSync(join(directory, 'crm.sqlite'))) throw new Error('Ключ CRM отсутствует. Восстановите .data/key из резервной копии.');
    if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 });
    this.key = readFileSync(keyPath);
    if (this.key.length !== 32) throw new Error('Повреждён ключ шифрования CRM. Восстановите его из резервной копии.');
    this.db = new DatabaseSync(join(directory, 'crm.sqlite'));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, handle TEXT, body TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS unique_handle ON leads(handle) WHERE handle IS NOT NULL;
      CREATE TABLE IF NOT EXISTS identities (
        account_id TEXT NOT NULL, user_id TEXT NOT NULL, lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
        checked_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(account_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS inbox (
        account_id TEXT NOT NULL, mid TEXT NOT NULL, body TEXT NOT NULL,
        processed INTEGER NOT NULL DEFAULT 0, received_at INTEGER NOT NULL,
        PRIMARY KEY(account_id, mid)
      );
    `);
  }

  seal(value: unknown) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }
  unseal<T>(value: string): T {
    const data = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString());
  }
  get<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? this.unseal<T>(String(row.value)) : undefined;
  }
  set(key: string, value: unknown) {
    this.db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, this.seal(value));
  }
  deleteSetting(key: string) { this.db.prepare('DELETE FROM settings WHERE key = ?').run(key); }
  transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  list(): Lead[] {
    return this.db.prepare('SELECT body FROM leads ORDER BY json_extract(body, \'$.created\') DESC').all()
      .map(row => leadSchema.parse(JSON.parse(String(row.body))));
  }
  find(id: string): Lead | undefined {
    const row = this.db.prepare('SELECT body FROM leads WHERE id = ?').get(id);
    return row ? leadSchema.parse(JSON.parse(String(row.body))) : undefined;
  }
  byHandle(handle: string): Lead | undefined {
    const row = this.db.prepare('SELECT body FROM leads WHERE handle = ?').get(handle);
    return row ? leadSchema.parse(JSON.parse(String(row.body))) : undefined;
  }
  save(input: Lead) {
    const lead = leadSchema.parse(input);
    const duplicate = lead.handle ? this.byHandle(lead.handle) : undefined;
    if (duplicate && duplicate.id !== lead.id) throw new Error('DUPLICATE_HANDLE');
    this.db.prepare('INSERT INTO leads(id, handle, body) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET handle = excluded.handle, body = excluded.body')
      .run(lead.id, lead.handle || null, JSON.stringify(lead));
    return lead;
  }
  remove(id: string) { this.db.prepare('DELETE FROM leads WHERE id = ?').run(id); }
  close() { this.db.close(); }
}
