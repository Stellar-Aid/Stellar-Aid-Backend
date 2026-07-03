/**
 * Vault read endpoints.
 *
 *   GET /            -> list vaults
 *   GET /:id         -> vault detail (with aggregates)
 *   GET /:id/deposits-> deposits for a vault
 *
 * All handlers are read-only projections of indexer-maintained DB state.
 */
import { Router } from 'express';
import { db } from '../db/connection';
import { AppError } from '../errors/AppError';
import { asyncHandler } from '../middleware/errorHandler';

export const vaultsRouter = Router();

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw AppError.badRequest(`Invalid vault id: ${raw}`);
  }
  return id;
}

vaultsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const vaults = await db('vaults').select('*').orderBy('id', 'asc');
    res.json({ data: vaults });
  }),
);

vaultsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const vault = await db('vaults').where({ id }).first();
    if (!vault) {
      throw AppError.notFound(`Vault ${id} not found`);
    }
    const [milestoneCount] = await db('milestones')
      .where({ vault_id: id })
      .count<{ count: number }[]>({ count: '*' });
    const [depositCount] = await db('deposits')
      .where({ vault_id: id })
      .count<{ count: number }[]>({ count: '*' });

    res.json({
      data: {
        ...vault,
        aggregates: {
          total_deposited: vault.total_deposited,
          total_released: vault.total_released,
          total_refunded: vault.total_refunded,
          milestone_count: Number(milestoneCount?.count ?? 0),
          deposit_count: Number(depositCount?.count ?? 0),
        },
      },
    });
  }),
);

vaultsRouter.get(
  '/:id/deposits',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const vault = await db('vaults').where({ id }).first();
    if (!vault) {
      throw AppError.notFound(`Vault ${id} not found`);
    }
    const deposits = await db('deposits')
      .where({ vault_id: id })
      .orderBy('id', 'desc');
    res.json({ data: deposits });
  }),
);
