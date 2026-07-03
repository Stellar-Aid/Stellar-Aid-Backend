/**
 * Network configuration for StellarAid Backend.
 *
 * Loads and RIGIDLY validates all network-critical environment variables at
 * boot time. If the configured NETWORK_PASSPHRASE does not match the canonical
 * passphrase for the selected NETWORK, we throw immediately — this prevents the
 * indexer from ever talking to the wrong network (a class of bug that can cause
 * funds to be tracked against the wrong ledger history).
 */
import dotenv from 'dotenv';

dotenv.config();

export type NetworkName = 'testnet' | 'mainnet';

/** Canonical Stellar network passphrases. These are fixed protocol constants. */
export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
export const PUBLIC_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

export interface NetworkConfig {
  /** Selected network. */
  network: NetworkName;
  /** Soroban RPC endpoint URL. */
  rpcUrl: string;
  /** Network passphrase — validated against the canonical value for `network`. */
  networkPassphrase: string;
  /** Deployed vault contract id (C... address). */
  vaultContractId: string;
  /** HTTP port for the API server. */
  port: number;
  /** Secret used to sign/verify JWTs. */
  jwtSecret: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function expectedPassphrase(network: NetworkName): string {
  return network === 'mainnet' ? PUBLIC_PASSPHRASE : TESTNET_PASSPHRASE;
}

/**
 * Build and validate the network configuration from the environment.
 * Throws a clear, actionable error on any mismatch or missing value.
 */
export function loadNetworkConfig(): NetworkConfig {
  const rawNetwork = required('NETWORK').toLowerCase();
  if (rawNetwork !== 'testnet' && rawNetwork !== 'mainnet') {
    throw new Error(
      `Invalid NETWORK "${rawNetwork}". Expected "testnet" or "mainnet".`,
    );
  }
  const network = rawNetwork as NetworkName;

  const networkPassphrase = required('NETWORK_PASSPHRASE');
  const expected = expectedPassphrase(network);
  if (networkPassphrase !== expected) {
    throw new Error(
      `NETWORK_PASSPHRASE mismatch for network "${network}". ` +
        `Expected "${expected}" but received "${networkPassphrase}". ` +
        `Refusing to start to avoid talking to the wrong Stellar network.`,
    );
  }

  const rpcUrl = required('RPC_URL');
  const vaultContractId = required('VAULT_CONTRACT_ID');
  const jwtSecret = required('JWT_SECRET');

  const port = Number(process.env.PORT ?? '3000');
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT "${process.env.PORT}". Expected 1-65535.`);
  }

  return {
    network,
    rpcUrl,
    networkPassphrase,
    vaultContractId,
    port,
    jwtSecret,
  };
}

/**
 * Cached singleton. Lazily initialised so importing this module does not force
 * validation until the config is actually needed (keeps unit tests flexible).
 */
let cached: NetworkConfig | undefined;

export function getNetworkConfig(): NetworkConfig {
  if (!cached) {
    cached = loadNetworkConfig();
  }
  return cached;
}
