import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'parley.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_workflow (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      workflowId TEXT NOT NULL,
      startedAt TEXT NOT NULL
    )
  `);
  return db;
}

export function getActiveWorkflow(): { workflowId: string; startedAt: string } | undefined {
  const row = getDb().prepare('SELECT workflowId, startedAt FROM active_workflow WHERE id = 1').get();
  return row as { workflowId: string; startedAt: string } | undefined;
}

export function setActiveWorkflow(workflowId: string): void {
  getDb().prepare(
    'INSERT OR REPLACE INTO active_workflow (id, workflowId, startedAt) VALUES (1, ?, ?)'
  ).run(workflowId, new Date().toISOString());
}

export function clearActiveWorkflow(): void {
  getDb().prepare('DELETE FROM active_workflow WHERE id = 1').run();
}
