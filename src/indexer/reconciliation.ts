/**
 * Reconciliation engine.
 *
 * On a cron schedule, re-reads authoritative on-chain vault state
 * (`get_vault_info` -> deposited/released/refunded) and compares it against the
 * aggregates the indexer has accumulated in the DB. Any drift is logged/flagged
 * so operators can detect a missed event, a reorg, or a decode bug.
 *
 * The cron wiring, on-chain read scaffolding, and drift-report shape are real;
 * the actual scVal decoding of the contract view and the DB aggregate query are
 * marked TODO because they depend on the finalized contract ABI.
 */
import * as cron from 'node-cron';
import { rpc } from '@stellar/stellar-sdk';
import { supabase } from '../db/connection';
import { NetworkConfig } from '../config/network';

export interface VaultAggregates {
  deposited: string;
  released: string;
  refunded: string;
}

export interface DriftReport {
  contractId: string;
  onChain: VaultAggregates;
  offChain: VaultAggregates;
  hasDrift: boolean;
  fields: string[];
  checkedAt: string;
}

export interface ReconciliationOptions {
  /** Cron expression. Default: every 15 minutes. */
  schedule?: string;
}

export class ReconciliationEngine {
  private readonly server: rpc.Server;
  private readonly contractId: string;
  private readonly schedule: string;
  private task: cron.ScheduledTask | undefined;

  constructor(config: NetworkConfig, options: ReconciliationOptions = {}) {
    this.server = new rpc.Server(config.rpcUrl, {
      allowHttp: config.network === 'testnet',
    });
    this.contractId = config.vaultContractId;
    this.schedule = options.schedule ?? '*/15 * * * *';
  }

  /** Register the cron task and start it. */
  start(): void {
    if (this.task) {
      return;
    }
    if (!cron.validate(this.schedule)) {
      throw new Error(`Invalid cron schedule: ${this.schedule}`);
    }
    this.task = cron.schedule(this.schedule, () => {
      void this.reconcileOnce().catch((err) =>
        console.error('[ReconciliationEngine] run failed:', err),
      );
    });
    console.log(`[ReconciliationEngine] scheduled "${this.schedule}"`);
  }

  /** Stop and dispose the cron task. */
  stop(): void {
    this.task?.stop();
    this.task = undefined;
    console.log('[ReconciliationEngine] stopped');
  }

  /** Run a single reconciliation pass and return the drift report. */
  async reconcileOnce(): Promise<DriftReport> {
    const onChain = await this.readOnChainVaultInfo();
    const offChain = await this.readOffChainAggregates();

    const fields: string[] = [];
    if (onChain.deposited !== offChain.deposited) fields.push('deposited');
    if (onChain.released !== offChain.released) fields.push('released');
    if (onChain.refunded !== offChain.refunded) fields.push('refunded');

    const report: DriftReport = {
      contractId: this.contractId,
      onChain,
      offChain,
      hasDrift: fields.length > 0,
      fields,
      checkedAt: new Date().toISOString(),
    };

    if (report.hasDrift) {
      console.warn('[ReconciliationEngine] DRIFT DETECTED', report);
    } else {
      console.log('[ReconciliationEngine] in sync', {
        contractId: this.contractId,
      });
    }
    return report;
  }

  /**
   * Read the vault's authoritative aggregates from chain via `get_vault_info`.
   */
  private async readOnChainVaultInfo(): Promise<VaultAggregates> {
    void this.server;
    // TODO: replace stub with real simulateTransaction against get_vault_info.
    return { deposited: '0', released: '0', refunded: '0' };
  }

  /**
   * Read the indexer's off-chain aggregates from the DB.
   */
  private async readOffChainAggregates(): Promise<VaultAggregates> {
    const { data: row, error } = await supabase
      .from('vaults')
      .select('total_deposited, total_released, total_refunded')
      .eq('contract_id', this.contractId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[ReconciliationEngine] readOffChainAggregates error:', error);
    }

    return {
      deposited: row?.total_deposited ?? '0',
      released: row?.total_released ?? '0',
      refunded: row?.total_refunded ?? '0',
    };
  }
}
