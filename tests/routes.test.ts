// Environment MUST be set before importing modules that read it at load time
// (network config + DB connection filename).
import path from 'path';
import fs from 'fs';
import os from 'os';

const TMP_DB = path.join(os.tmpdir(), `stellaraid-test-${Date.now()}.db`);

process.env.NETWORK = 'testnet';
process.env.NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
process.env.RPC_URL = 'https://soroban-testnet.stellar.org';
process.env.VAULT_CONTRACT_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.PORT = '4999';
process.env.DB_FILE = TMP_DB;

// eslint-disable-next-line @typescript-eslint/no-var-requires
import request from 'supertest';
import { app } from '../src/index';
import { db, closeDb } from '../src/db/connection';
import { signToken } from '../src/auth/jwt';

beforeAll(async () => {
  await db.migrate.latest({
    directory: path.resolve(__dirname, '../src/db/migrations'),
    loadExtensions: ['.ts'],
  });
  await db('vaults').insert({
    contract_id: process.env.VAULT_CONTRACT_ID,
    admin: 'GADMIN',
    token_address: 'CTOKEN',
    total_deposited: '0',
    total_released: '0',
    total_refunded: '0',
  });
});

afterAll(async () => {
  await closeDb();
  try {
    fs.unlinkSync(TMP_DB);
  } catch {
    /* ignore */
  }
});

describe('API', () => {
  it('GET /health returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/vaults returns an array under data', async () => {
    const res = await request(app).get('/api/vaults');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/milestones without tx_hash returns 400', async () => {
    const token = signToken({ sub: 'tester' });
    const res = await request(app)
      .post('/api/milestones')
      .set('Authorization', `Bearer ${token}`)
      .send({ vaultId: 1, title: 'Build well', amount: '1000', recipient: 'GRECIP' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.correlationId).toBeTruthy();
  });

  it('POST /api/milestones without auth returns 401', async () => {
    const res = await request(app).post('/api/milestones').send({ tx_hash: 'abc' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('unmatched route returns a shaped 404', async () => {
    const res = await request(app).get('/does/not/exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('/does/not/exist');
    expect(res.body.error.correlationId).toBeTruthy();
  });
});
