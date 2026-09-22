import type { Pool, PoolClient } from 'pg';
import { registry } from './ConnectionRegistry';

interface Session {
  sessionId: string;
  connectionId: string;
  database: string;
  client: PoolClient | null;
  pid: number;
  inTransaction: boolean;
  dead: boolean;
}

export interface SessionManagerDeps {
  getPool(connectionId: string, database: string): Pool;
}

/** A checked-out client ready to run a statement. */
export interface SessionClient {
  client: PoolClient;
  pid: number;
  /** True when the previous client had died and a fresh one was checked out. */
  reopened: boolean;
  session: Session;
}

const BEGIN_TAGS = new Set(['BEGIN', 'START TRANSACTION']);
const END_TAGS = new Set(['COMMIT', 'END', 'ROLLBACK', 'PREPARE TRANSACTION']);

/**
 * One dedicated PoolClient per query tab so BEGIN, SET and temp tables persist between runs.
 * Transaction state is tracked from command tags; a dead client is reopened transparently.
 */
export class SessionManager {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly deps: SessionManagerDeps) {}

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  pidOf(sessionId: string): number | undefined {
    return this.sessions.get(sessionId)?.pid;
  }

  inTransaction(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.inTransaction ?? false;
  }

  async open(sessionId: string, connectionId: string, database: string): Promise<{ pid: number }> {
    const existing = this.sessions.get(sessionId);
    if (existing && existing.client && !existing.dead) return { pid: existing.pid };
    if (existing) await this.close(sessionId);
    const session: Session = {
      sessionId,
      connectionId,
      database,
      client: null,
      pid: 0,
      inTransaction: false,
      dead: false
    };
    this.sessions.set(sessionId, session);
    await this.checkout(session);
    return { pid: session.pid };
  }

  /** Returns a live client for the session, reopening it if the previous one died. */
  async get(sessionId: string): Promise<SessionClient> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    let reopened = false;
    if (!session.client || session.dead) {
      if (session.client) {
        try {
          session.client.release(true);
        } catch {
          // already gone
        }
      }
      session.client = null;
      session.inTransaction = false;
      await this.checkout(session);
      reopened = true;
    }
    return { client: session.client as PoolClient, pid: session.pid, reopened, session };
  }

  /** Update transaction tracking from a completed statement's command tag (or its text on failure). */
  noteCommand(sessionId: string, commandTag: string | undefined, statementText: string, failed: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const tag = (commandTag ?? '').toUpperCase().trim();
    const head = statementText.trim().slice(0, 40).toUpperCase().replace(/\s+/g, ' ');
    if (BEGIN_TAGS.has(tag) || (!failed && (head.startsWith('BEGIN') || head.startsWith('START TRANSACTION')))) {
      session.inTransaction = true;
      return;
    }
    if (tag === 'ROLLBACK' && /^ROLLBACK\s+TO\b/.test(head)) return; // savepoint rollback keeps the tx
    if (END_TAGS.has(tag)) {
      session.inTransaction = false;
    }
  }

  /** Mark the session's client unusable; the next get() reopens it. */
  markDead(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.dead = true;
    session.inTransaction = false;
  }

  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    const client = session.client;
    if (!client) return;
    if (session.inTransaction && !session.dead) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore: connection may be gone
      }
    }
    try {
      client.release(session.dead ? true : undefined);
    } catch {
      // already released
    }
  }

  async closeAllFor(connectionId: string): Promise<void> {
    const ids = [...this.sessions.values()].filter((s) => s.connectionId === connectionId).map((s) => s.sessionId);
    await Promise.all(ids.map((id) => this.close(id)));
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
  }

  private async checkout(session: Session): Promise<void> {
    const pool = this.deps.getPool(session.connectionId, session.database);
    const client = await pool.connect();
    session.client = client;
    session.dead = false;
    session.pid = (client as PoolClient & { processID?: number }).processID ?? 0;
    const dead = () => {
      session.dead = true;
      session.inTransaction = false;
    };
    client.on('error', dead);
    client.on('end', dead);
  }
}

/** App-wide session manager backed by the connection registry. */
export const sessions = new SessionManager({
  getPool: (connectionId, database) => registry.getPool(connectionId, database)
});

/** Close every session of a connection (called on disconnect). */
export function closeSessionsFor(connectionId: string): Promise<void> {
  return sessions.closeAllFor(connectionId);
}
