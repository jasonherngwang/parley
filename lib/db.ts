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
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflowId TEXT NOT NULL,
      prUrl TEXT NOT NULL,
      prTitle TEXT NOT NULL,
      repoName TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      completedAt TEXT NOT NULL,
      specialistOutputs TEXT NOT NULL,
      disputeOutcomes TEXT NOT NULL,
      verdict TEXT NOT NULL
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

export interface ReviewInsert {
  workflowId: string;
  prUrl: string;
  prTitle: string;
  repoName: string;
  startedAt: string;
  completedAt: string;
  specialistOutputs: unknown;
  disputeOutcomes: unknown;
  verdict: unknown;
}

export function insertReview(record: ReviewInsert): number {
  const result = getDb()
    .prepare(
      `INSERT INTO reviews
         (workflowId, prUrl, prTitle, repoName, startedAt, completedAt, specialistOutputs, disputeOutcomes, verdict)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      record.workflowId,
      record.prUrl,
      record.prTitle,
      record.repoName,
      record.startedAt,
      record.completedAt,
      JSON.stringify(record.specialistOutputs),
      JSON.stringify(record.disputeOutcomes),
      JSON.stringify(record.verdict)
    );
  return result.lastInsertRowid as number;
}

export interface ReviewSummary {
  id: number;
  workflowId: string;
  prUrl: string;
  prTitle: string;
  repoName: string;
  startedAt: string;
  completedAt: string;
  findingCount: number;
}

export function getReviewList(limit = 20, offset = 0): ReviewSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT
         id, workflowId, prUrl, prTitle, repoName, startedAt, completedAt,
         json_array_length(json_extract(verdict, '$.findings')) AS findingCount
       FROM reviews
       ORDER BY completedAt DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as ReviewSummary[];
  return rows;
}

export interface ReviewRecord extends ReviewSummary {
  specialistOutputs: string;
  disputeOutcomes: string;
  verdict: string;
}

export function getReviewById(id: number): ReviewRecord | undefined {
  return getDb()
    .prepare('SELECT * FROM reviews WHERE id = ?')
    .get(id) as ReviewRecord | undefined;
}
