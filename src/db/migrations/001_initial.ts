/**
 * Initial schema.
 *
 * Amount columns are TEXT to preserve i128 precision coming off-chain — SQLite
 * INTEGER / JS number cannot safely hold Soroban i128 values.
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('vaults', (t) => {
    t.increments('id').primary();
    t.string('contract_id').notNullable().unique();
    t.string('admin').notNullable();
    t.string('token_address').notNullable();
    t.text('total_deposited').notNullable().defaultTo('0');
    t.text('total_released').notNullable().defaultTo('0');
    t.text('total_refunded').notNullable().defaultTo('0');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('milestones', (t) => {
    t.increments('id').primary();
    t.integer('vault_id').notNullable().references('id').inTable('vaults').onDelete('CASCADE');
    // The milestone id as assigned on-chain by the contract.
    t.integer('onchain_id');
    t.string('title').notNullable();
    t.text('description').notNullable().defaultTo('');
    t.text('amount').notNullable().defaultTo('0');
    // Proposed | Active | Completed | Rejected
    t.string('status').notNullable().defaultTo('Proposed');
    t.string('recipient').notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['vault_id']);
    t.index(['status']);
  });

  await knex.schema.createTable('deposits', (t) => {
    t.increments('id').primary();
    t.integer('vault_id').notNullable().references('id').inTable('vaults').onDelete('CASCADE');
    t.string('donor').notNullable();
    t.text('amount').notNullable();
    t.string('tx_hash').notNullable();
    t.integer('ledger');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['vault_id']);
    t.index(['donor']);
  });

  await knex.schema.createTable('events', (t) => {
    t.increments('id').primary();
    // deposit | milestone | release | refund
    t.string('type').notNullable();
    t.string('tx_hash');
    t.integer('ledger');
    t.string('contract_id').notNullable();
    // Raw decoded event payload as JSON text.
    t.text('payload');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['type']);
    t.index(['contract_id']);
    t.index(['ledger']);
  });

  await knex.schema.createTable('sync_state', (t) => {
    t.increments('id').primary();
    t.string('contract_id').notNullable().unique();
    t.integer('last_ledger').notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sync_state');
  await knex.schema.dropTableIfExists('events');
  await knex.schema.dropTableIfExists('deposits');
  await knex.schema.dropTableIfExists('milestones');
  await knex.schema.dropTableIfExists('vaults');
}
