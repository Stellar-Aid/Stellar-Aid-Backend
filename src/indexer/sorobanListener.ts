/**
 * Soroban event listener / sync engine.
 *
 * Polls the Soroban RPC `getEvents` endpoint for the vault contract, starting
 * from the last-synced ledger persisted in the `sync_state` table, decodes each
 * contract event, and upserts the derived state into the DB.
 */
import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { supabase } from '../db/connection';
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
}

export class SorobanListener {
  private readonly server: rpc.Server;
  private readonly contractId: string;
  private readonly pollIntervalMs: number;
  private readonly pageSize: number;

  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(config: NetworkConfig, options: SorobanListenerOptions = {}) {
    this.server = new rpc.Server(config.rpcUrl, {
      allowHttp: config.network === 'testnet',
    });
    this.contractId = config.vaultContractId;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.pageSize = options.pageSize ?? 100;
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
    const { data: row, error } = await supabase
      .from('sync_state')
      .select('last_ledger')
      .eq('contract_id', this.contractId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[SorobanListener] getCursor error:', error);
    }
    
    return row?.last_ledger ?? 0;
  }

  private async setCursor(ledger: number): Promise<void> {
    const { error } = await supabase
      .from('sync_state')
      .upsert(
        { contract_id: this.contractId, last_ledger: ledger },
        { onConflict: 'contract_id' }
      );

    if (error) {
      console.error('[SorobanListener] setCursor error:', error);
    }
  }

  // --- decoding + persistence --------------------------------------------

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
        payload.topics = topics.map((t) => safeNative(t));
      }
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

  private async upsertEvent(evt: DecodedEvent): Promise<void> {
    const { error } = await supabase.from('events').insert({
      type: evt.type,
      tx_hash: evt.txHash ?? null,
      ledger: evt.ledger,
      contract_id: evt.contractId,
      payload: JSON.stringify(evt.payload),
    });

    if (error) {
      console.error('[SorobanListener] upsertEvent error:', error);
    }
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
    return null;
  }
}
