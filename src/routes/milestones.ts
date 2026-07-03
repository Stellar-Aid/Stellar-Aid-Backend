/**
 * Milestone endpoints.
 *
 *   GET  /            -> list (optional ?vaultId & ?status filters)
 *   GET  /:id         -> single milestone
 *   POST /            -> (auth) record a PROPOSED milestone. Requires a
 *                        submitted on-chain transaction hash (tx_hash). The API
 *                        never mutates on-chain-derived state without proof of a
 *                        submitted transaction.
 */
import { Router } from 'express';
import { supabase } from '../db/connection';
import { AppError } from '../errors/AppError';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../auth/jwt';

export const milestonesRouter = Router();

const VALID_STATUSES = ['Proposed', 'Active', 'Completed', 'Rejected'] as const;
type MilestoneStatus = (typeof VALID_STATUSES)[number];

function isStatus(value: unknown): value is MilestoneStatus {
  return typeof value === 'string' && VALID_STATUSES.includes(value as MilestoneStatus);
}

milestonesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    let query = supabase.from('milestones').select('*').order('id', { ascending: true });

    const { vaultId, status } = req.query;
    if (vaultId !== undefined) {
      const id = Number(vaultId);
      if (!Number.isInteger(id) || id <= 0) {
        throw AppError.badRequest(`Invalid vaultId: ${String(vaultId)}`);
      }
      query = query.eq('vault_id', id);
    }
    if (status !== undefined) {
      if (!isStatus(status)) {
        throw AppError.badRequest(
          `Invalid status. Expected one of: ${VALID_STATUSES.join(', ')}`,
        );
      }
      query = query.eq('status', status);
    }

    const { data: milestones, error } = await query;
    if (error) throw new Error(error.message);

    res.json({ data: milestones });
  }),
);

milestonesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw AppError.badRequest(`Invalid milestone id: ${req.params.id}`);
    }
    
    const { data: milestone, error } = await supabase
      .from('milestones')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !milestone) {
      throw AppError.notFound(`Milestone ${id} not found`);
    }

    res.json({ data: milestone });
  }),
);

interface CreateMilestoneBody {
  vaultId?: unknown;
  title?: unknown;
  description?: unknown;
  amount?: unknown;
  recipient?: unknown;
  tx_hash?: unknown;
}

milestonesRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as CreateMilestoneBody;

    // MANDATORY: never mutate on-chain-derived state without a submitted tx.
    if (typeof body.tx_hash !== 'string' || body.tx_hash.trim() === '') {
      throw AppError.badRequest(
        'tx_hash is required: milestones may only be recorded against a submitted on-chain transaction',
      );
    }

    const vaultId = Number(body.vaultId);
    if (!Number.isInteger(vaultId) || vaultId <= 0) {
      throw AppError.badRequest('vaultId is required and must be a positive integer');
    }
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      throw AppError.badRequest('title is required');
    }
    if (typeof body.recipient !== 'string' || body.recipient.trim() === '') {
      throw AppError.badRequest('recipient is required');
    }
    if (typeof body.amount !== 'string' || body.amount.trim() === '') {
      throw AppError.badRequest('amount is required (string to preserve i128 precision)');
    }

    const { data: vault, error: vaultError } = await supabase
      .from('vaults')
      .select('contract_id')
      .eq('id', vaultId)
      .single();

    if (vaultError || !vault) {
      throw AppError.notFound(`Vault ${vaultId} not found`);
    }

    const { data: inserted, error: insertError } = await supabase
      .from('milestones')
      .insert({
        vault_id: vaultId,
        title: body.title.trim(),
        description: typeof body.description === 'string' ? body.description : '',
        amount: body.amount.trim(),
        status: 'Proposed',
        recipient: body.recipient.trim(),
      })
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    const { error: eventError } = await supabase.from('events').insert({
      type: 'milestone',
      tx_hash: body.tx_hash.trim(),
      contract_id: vault.contract_id,
      payload: JSON.stringify({ source: 'api', action: 'propose_milestone', vaultId }),
    });

    if (eventError) throw new Error(eventError.message);

    res.status(201).json({ data: inserted });
  }),
);
