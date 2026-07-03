/**
 * Soroban event listener / sync engine.
 *
 * Polls the Soroban RPC `getEvents` endpoint for the vault contract, starting
 * from the last-synced ledger persisted in the `sync_state` table, decodes each
 * contract event, and upserts the derived state into the DB.
 *
 * The RPC polling loop, cursor persistence, and DB upsert calls are fully
 * implemented. The low-level `scValToNative` decoding of each event's topics/
 * value is stubbed with TODOs — the exact XDR shape depends on the contract's
 * final event schema.
 */
import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { Knex } from 'knex';
import { db as defaultDb } from '../db/connection';
import { NetworkConfig } from '../config/network';

type EventType = 'deposit' | 'milestone' | 'release' | 'refund' | 'unknown';

interface DecodedEvent {
  type: EventType;
  ledger: number;
  txHash: string | undefined;
  contractId: string;
  payload: Record<string, unknown>;
}

export interface SorobanListenerOptions {
  /** Milliseconds between polls. Default 5000. */
  pollIntervalMs?: number;
  /** Max events per getEvents page. Default 100. */
  pageSize?: number;
  /** Injectable DB (tests). Defaults to the shared singleton. */
  knexDb?: Knex;
}

export class SorobanListener {
  private readonly server: rpc.Server;
  private readonly contractId: string;
  private readonly pollIntervalMs: number;
  private readonly pageSize: number;
  private readonly knexDb: Knex;

  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(config: NetworkConfig, options: SorobanListenerOptions = {}) {
    this.server = new rpc.Server(config.rpcUrl, {
      allowHttp: config.network === 'testnet',
    });
    this.contractId = config.vaultContractId;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.pageSize = options.pageSize ?? 100;
    this.knexDb = options.knexDb ?? defaultDb;
  }

  /** Start the recurring poll loop. Idempotent. */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    const tick = async (): Promise<void> => {
      if (!this.running) {
        return;
      }
      try {
        await this.syncOnce();
      } catch (err) {
        console.error('[SorobanListener] syncOnce failed:', err);
      } finally {
        if (this.running) {
          this.timer = setTimeout(() => void tick(), this.pollIntervalMs);
        }
      }
    };
    void tick();
    console.log(`[SorobanListener] started for contract ${this.contractId}`);
  }

  /** Stop the poll loop. */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    console.log('[SorobanListener] stopped');
  }

  /**
   * Perform exactly one sync pass: read cursor -> fetch events -> decode ->
   * upsert -> advance cursor. Returns the number of events processed.
   */
  async syncOnce(): Promise<number> {
    const startLedger = await this.getCursor();

    const response = await this.server.getEvents({
      startLedger: startLedger + 1,
      filters: [
        {
          type: 'contract',
          contractIds: [this.contractId],
        },
      ],
      limit: this.pageSize,
    });

    const events = response.events ?? [];
    let processed = 0;

    for (const raw of events) {
      const decoded = this.decodeEvent(raw);
      await this.upsertEvent(decoded);
      processed += 1;
    }

    // Advance the cursor to the latest ledger the RPC reported, so we never
    // re-scan ledgers we've already asked about even when they were empty.
    const newCursor = response.latestLedger ?? startLedger;
    if (newCursor > startLedger) {
      await this.setCursor(newCursor);
    }

    if (processed > 0) {
      console.log(
        `[SorobanListener] processed ${processed} event(s); cursor -> ${newCursor}`,
      );
    }
    return processed;
  }

  // --- cursor persistence -------------------------------------------------

  private async getCursor(): Promise<number> {
    const row = await this.knexDb('sync_state')
      .where({ contract_id: this.contractId })
      .first<{ last_ledger: number } | undefined>();
    return row?.last_ledger ?? 0;
  }

  private async setCursor(ledger: number): Promise<void> {
    // Upsert on contract_id.
    await this.knexDb('sync_state')
      .insert({ contract_id: this.contractId, last_ledger: ledger })
      .onConflict('contract_id')
      .merge({ last_ledger: ledger });
  }

  // --- decoding + persistence --------------------------------------------

  /**
   * Decode a raw RPC event into our normalized shape.
   *
   * TODO: The contract emits typed events (topic0 = symbol like "deposit",
   * "milestone", "release", "refund"). Fully map each event's topics/value to
   * the vault domain once the contract event schema is frozen. Right now we
   * best-effort read topic0 as the event type and stash the native value.
   */
  private decodeEvent(raw: rpc.Api.EventResponse): DecodedEvent {
    let type: EventType = 'unknown';
    const payload: Record<string, unknown> = {};

    try {
      const topics = (raw.topic ?? []) as xdr.ScVal[];
      if (topics.length > 0) {
        const topic0 = scValToNative(topics[0]) as unknown;
        if (typeof topic0 === 'string') {
          type = normalizeType(topic0);
        }
        // TODO: decode remaining topics (e.g. donor / milestone id) per event.
        payload.topics = topics.map((t) => safeNative(t));
      }
      // TODO: map `raw.value` to concrete fields (amount, recipient, status…).
      payload.value = safeNative(raw.value as xdr.ScVal);
    } catch (err) {
      console.error('[SorobanListener] failed to decode event, storing raw:', err);
    }

    return {
      type,
      ledger: raw.ledger,
      txHash: raw.txHash,
      contractId: raw.contractId?.toString() ?? this.contractId,
      payload,
    };
  }

  /**
   * Upsert derived state for a single decoded event. Always records the raw
   * event in `events`; additionally projects into `deposits` / `milestones` /
   * `vaults` aggregates based on the event type.
   */
  private async upsertEvent(evt: DecodedEvent): Promise<void> {
    await this.knexDb('events').insert({
      type: evt.type,
      tx_hash: evt.txHash ?? null,
      ledger: evt.ledger,
      contract_id: evt.contractId,
      payload: JSON.stringify(evt.payload),
    });

    // TODO: Based on evt.type, project into domain tables. Sketch of intent:
    //   - 'deposit'   -> insert into `deposits`, bump vaults.total_deposited
    //   - 'milestone' -> upsert `milestones` (onchain_id, title, status…)
    //   - 'release'   -> set milestone status Completed, bump total_released
    //   - 'refund'    -> bump vaults.total_refunded
    // These require the finalized event payload mapping (see decodeEvent TODOs)
    // and i128 string-safe arithmetic; left as a stub to avoid guessing amounts.
  }
}

function normalizeType(topic: string): EventType {
  const t = topic.toLowerCase();
  if (t.includes('deposit')) return 'deposit';
  if (t.includes('milestone')) return 'milestone';
  if (t.includes('release')) return 'release';
  if (t.includes('refund')) return 'refund';
  return 'unknown';
}

function safeNative(val: xdr.ScVal | undefined): unknown {
  if (!val) return null;
  try {
    return scValToNative(val);
  } catch {
    // i128/u128 and custom types may throw depending on shape.
    return null;
  }
}
