/* global Blob, Buffer, TextEncoder, URL */

import assert from "node:assert/strict";
import { createDecipheriv } from "node:crypto";
import test from "node:test";

import {
  buildStorageManifest,
  canonicalJson,
  encryptIntelligence,
  IntelligenceEncryptionError,
  MAINNET,
  PAYLOAD_AAD,
  prepareStorage,
} from "./encrypt-intelligence-mainnet.mjs";

const PRIVATE_KEY = `0x${"11".repeat(32)}`;
const PUBLIC_KEY =
  "0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa";
const ADDRESS = "0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a";
const ROOT = `0x${"22".repeat(32)}`;
const TX_HASH = `0x${"33".repeat(32)}`;

test("canonical JSON is stable across insertion order", () => {
  assert.equal(
    canonicalJson({ z: 2, nested: { b: true, a: [3, "x"] }, a: 1 }),
    '{"a":1,"nested":{"a":[3,"x"],"b":true},"z":2}',
  );
});

test("AES-256-GCM envelope is deterministic with injected randomness", async () => {
  const calls = [];
  const randomBytes = (length) => {
    calls.push(length);
    return Buffer.alloc(length, length === 32 ? 0x41 : 0x42);
  };
  const wrapped = Uint8Array.from([2, ...new Uint8Array(81).fill(9)]);
  const encrypted = await encryptIntelligence(
    { memory: { district: "Rivergate", visits: 3 }, enabled: true },
    { address: ADDRESS, publicKey: PUBLIC_KEY },
    {
      randomBytes,
      storageSdk: fakeCryptoSdk(),
      ethers: { computeAddress: () => ADDRESS },
      wrapKey: async (key, publicKey) => {
        assert.deepEqual(key, new Uint8Array(32).fill(0x41));
        assert.deepEqual(publicKey, new Uint8Array(33).fill(7));
        return wrapped;
      },
    },
  );

  assert.deepEqual(calls, [32, 12]);
  assert.deepEqual(encrypted.sealedKey, wrapped);
  assert.equal(encrypted.recipientAddress, ADDRESS);
  const envelope = JSON.parse(
    Buffer.from(encrypted.ciphertextBytes).toString(),
  );
  assert.equal(envelope.encryption.algorithm, "AES-256-GCM");
  assert.equal(envelope.encryption.aad, PAYLOAD_AAD);

  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.alloc(32, 0x41),
    Buffer.from(envelope.encryption.nonce, "base64"),
  );
  decipher.setAAD(Buffer.from(PAYLOAD_AAD));
  decipher.setAuthTag(
    Buffer.from(envelope.encryption.authenticationTag, "base64"),
  );
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString();
  assert.equal(
    plaintext,
    '{"enabled":true,"memory":{"district":"Rivergate","visits":3}}\n',
  );
});

test("installed official 0G ECIES primitive wraps and recovers the AES key", async () => {
  const runtime = await installedRuntime();
  const encrypted = await encryptIntelligence(
    { test: "official-sdk-round-trip" },
    { address: ADDRESS, publicKey: PUBLIC_KEY },
    {
      randomBytes: (length) => Buffer.alloc(length, length),
      storageSdk: runtime.storageSdk,
      ethers: runtime.ethers,
      recoveryPrivateKey: PRIVATE_KEY,
    },
  );
  assert.equal(encrypted.keyRecoveryTested, true);
  const header = runtime.storageSdk.parseEncryptionHeader(encrypted.sealedKey);
  const wrappingKey = runtime.storageSdk.deriveEciesDecryptKey(
    PRIVATE_KEY,
    header.ephemeralPub,
  );
  const recovered = runtime.storageSdk.decryptFile(
    wrappingKey,
    encrypted.sealedKey,
  );
  assert.deepEqual(recovered, new Uint8Array(32).fill(32));
});

test("recipient public key must derive to the declared address", async () => {
  await assert.rejects(
    encryptIntelligence(
      { safe: true },
      { address: `0x${"aa".repeat(20)}`, publicKey: PUBLIC_KEY },
      {
        storageSdk: fakeCryptoSdk(),
        ethers: { computeAddress: () => ADDRESS },
      },
    ),
    errorWithCode("RECIPIENT_MISMATCH"),
  );
});

test("simulate computes only the Merkle root and never constructs a signer", async () => {
  let signerConstructed = false;
  const encrypted = fakeEncrypted();
  const result = await prepareStorage(
    encrypted,
    { broadcast: false },
    storageDependencies({
      Wallet: class {
        constructor() {
          signerConstructed = true;
        }
      },
    }),
  );
  assert.deepEqual(result, { mode: "simulate", rootHash: ROOT });
  assert.equal(signerConstructed, false);
});

test("broadcast pins mainnet, finality options, proof download, and public manifest", async () => {
  const encrypted = fakeEncrypted();
  const calls = [];
  const dependencies = storageDependencies({
    splitableUpload: async (_data, options) => {
      calls.push(options);
      return [{ rootHashes: [ROOT], txHashes: [TX_HASH], txSeqs: [7] }, null];
    },
    downloadToBlob: async (root, options) => {
      assert.equal(root, ROOT);
      assert.deepEqual(options, { proof: true });
      return [new Blob([encrypted.ciphertextBytes]), null];
    },
  });
  const storage = await prepareStorage(
    encrypted,
    { broadcast: true, sponsorPrivateKey: "not-a-real-test-secret" },
    dependencies,
  );
  assert.deepEqual(calls, [
    { expectedReplica: 1, finalityRequired: true, skipIfFinalized: true },
  ]);
  assert.deepEqual(storage, {
    mode: "broadcast",
    rootHash: ROOT,
    transactionHash: TX_HASH,
    transactionSequence: 7,
    finalized: true,
    downloadVerified: true,
  });
  assert.deepEqual(
    buildStorageManifest(encrypted, storage, "Rivergate intelligence", true),
    {
      schemaVersion: 1,
      network: "0g-mainnet",
      chainId: 16661,
      rootHash: ROOT,
      transactionHash: TX_HASH,
      transactionSequence: 7,
      finalized: true,
      downloadVerified: true,
      ciphertextOnlyUploaded: true,
      keyRecoveryTested: true,
      dataDescription: "Rivergate intelligence",
      recipientFingerprint: encrypted.recipientFingerprint,
    },
  );
  assert.throws(
    () =>
      buildStorageManifest(encrypted, storage, "Rivergate intelligence", false),
    errorWithCode("RECOVERY_NOT_CONFIRMED"),
  );
});

test("upload errors are sanitized and cannot expose sponsor material", async () => {
  const secret = "sponsor-material-must-not-escape";
  await assert.rejects(
    prepareStorage(
      fakeEncrypted(),
      { broadcast: true, sponsorPrivateKey: secret },
      storageDependencies({
        splitableUpload: async () => [null, new Error(secret)],
      }),
    ),
    (error) => {
      assert.equal(error.code, "UPLOAD_FAILURE");
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
});

function fakeCryptoSdk() {
  return {
    normalizePubKey: () => new Uint8Array(33).fill(7),
    newEciesEncryptedFile() {},
    parseEncryptionHeader() {},
    deriveEciesDecryptKey() {},
    decryptFile() {},
    MemData: class {},
  };
}

function fakeEncrypted() {
  return Object.freeze({
    ciphertextBytes: new TextEncoder().encode("ciphertext-envelope"),
    sealedKey: new Uint8Array(82),
    recipientFingerprint: "ab".repeat(32),
  });
}

function storageDependencies(overrides = {}) {
  const splitableUpload =
    overrides.splitableUpload ??
    (async () => {
      throw new Error("upload must not run");
    });
  const downloadToBlob =
    overrides.downloadToBlob ??
    (async () => {
      throw new Error("download must not run");
    });
  class MemData {
    async merkleTree() {
      return [{ rootHash: () => ROOT }, null];
    }
    close() {}
  }
  class Indexer {
    constructor(url) {
      assert.equal(url, MAINNET.indexerUrl);
    }
    async newUploaderFromIndexerNodes(rpc, _signer, replicas) {
      assert.equal(rpc, MAINNET.rpcUrl);
      assert.equal(replicas, 1);
      return [
        {
          flow: { target: MAINNET.flowAddress },
          splitableUpload,
        },
        null,
      ];
    }
    downloadToBlob = downloadToBlob;
  }
  class JsonRpcProvider {
    constructor(url) {
      assert.equal(url, MAINNET.rpcUrl);
    }
    async getNetwork() {
      return { chainId: 16661n };
    }
  }
  const Wallet = overrides.Wallet ?? class {};
  return {
    storageSdk: {
      ...fakeCryptoSdk(),
      Indexer,
      MemData,
    },
    ethers: {
      computeAddress: () => ADDRESS,
      JsonRpcProvider,
      Wallet,
    },
  };
}

async function installedRuntime() {
  const { createRequire } = await import("node:module");
  const require = createRequire(
    new URL("../../packages/zero-g/package.json", import.meta.url),
  );
  return {
    storageSdk: require("@0gfoundation/0g-storage-ts-sdk"),
    ethers: require("ethers"),
  };
}

function errorWithCode(code) {
  return (error) =>
    error instanceof IntelligenceEncryptionError && error.code === code;
}
