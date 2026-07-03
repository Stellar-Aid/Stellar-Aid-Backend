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
import { supabase } from '../db/connection';
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
    const { data: vaults, error } = await supabase
      .from('vaults')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw new Error(error.message);

    res.json({ data: vaults });
  }),
);

vaultsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    
    const { data: vault, error: vaultError } = await supabase
      .from('vaults')
      .select('*')
      .eq('id', id)
      .single();

    if (vaultError || !vault) {
      throw AppError.notFound(`Vault ${id} not found`);
    }

    const { count: milestoneCount, error: msError } = await supabase
      .from('milestones')
      .select('*', { count: 'exact', head: true })
      .eq('vault_id', id);

    if (msError) throw new Error(msError.message);

    const { count: depositCount, error: depError } = await supabase
      .from('deposits')
      .select('*', { count: 'exact', head: true })
      .eq('vault_id', id);

    if (depError) throw new Error(depError.message);

    res.json({
      data: {
        ...vault,
        aggregates: {
          total_deposited: vault.total_deposited,
          total_released: vault.total_released,
          total_refunded: vault.total_refunded,
          milestone_count: Number(milestoneCount ?? 0),
          deposit_count: Number(depositCount ?? 0),
        },
      },
    });
  }),
);

vaultsRouter.get(
  '/:id/deposits',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    
    // Check if vault exists first
    const { data: vault, error: vaultError } = await supabase
      .from('vaults')
      .select('id')
      .eq('id', id)
      .single();

    if (vaultError || !vault) {
      throw AppError.notFound(`Vault ${id} not found`);
    }

    const { data: deposits, error: depError } = await supabase
      .from('deposits')
      .select('*')
      .eq('vault_id', id)
      .order('id', { ascending: false });

    if (depError) throw new Error(depError.message);

    res.json({ data: deposits });
  }),
);
