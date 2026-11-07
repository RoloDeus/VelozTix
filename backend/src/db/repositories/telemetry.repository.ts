import { DatabaseSync } from 'node:sqlite';
import { TelemetrySession } from '../../types/domain.js';
import { mapRow } from '../helpers.js';

export class TelemetryRepository {
  constructor(private db: DatabaseSync) {}

  findById(sessionId: string): TelemetrySession | null {
    const stmt = this.db.prepare(
      'SELECT * FROM TELEMETRY_SESSIONS WHERE session_id = ?'
    );
    return mapRow<TelemetrySession>(stmt.get(sessionId));
  }

  insert(session: TelemetrySession): void {
    const stmt = this.db.prepare(`
      INSERT INTO TELEMETRY_SESSIONS (
        session_id, customer_hash, event_id, dwell_time, scroll_depth,
        checkout_fill_time_ms, avg_flight_time_ms, cursor_linearity_index,
        copy_paste_flag, tab_switch_count, device_fingerprint, risk_score,
        verdict, profile_tag, inference_latency_ms, evaluated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.session_id,
      session.customer_hash,
      session.event_id,
      session.dwell_time,
      session.scroll_depth,
      session.checkout_fill_time_ms,
      session.avg_flight_time_ms,
      session.cursor_linearity_index,
      session.copy_paste_flag,
      session.tab_switch_count,
      session.device_fingerprint,
      session.risk_score,
      session.verdict,
      session.profile_tag,
      session.inference_latency_ms,
      session.evaluated_at
    );
  }
}
