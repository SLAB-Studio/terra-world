#!/usr/bin/env node
/* global Buffer, URL, console, process */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes as nodeRandomBytes,
  timingSafeEqual,
} from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAINNET = Object.freeze({
  network: "0g-mainnet",
  chainId: 16661,
  rpcUrl: "https://evmrpc.0g.ai",
  indexerUrl: "https://indexer-storage-turbo.0g.ai",
  flowAddress: "0x62d4144db0f0a6fbbaeb6296c785c71b3d57c526",
});

export const PAYLOAD_AAD = "rivergate-agentic-id-intelligence/v1";
const MAX_INPUT_BYTES = 1024 * 1024;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/u;

export class IntelligenceEncryptionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IntelligenceEncryptionError";
    this.code = code;
  }
}

export async function encryptIntelligence(
  payload,
  recipient,
  dependencies = {},
) {
  assertJsonPayload(payload);
  const runtime = await loadCryptoRuntime(dependencies);
  const normalizedPublicKey = runtime.storageSdk.normalizePubKey(
    recipient.publicKey,
  );
  const normalizedAddress = normalizeAddress(recipient.address);
  const derivedAddress = runtime.ethers.computeAddress(
    `0x${Buffer.from(normalizedPublicKey).toString("hex")}`,
  );
  if (derivedAddress.toLowerCase() !== normalizedAddress) {
    fail(
      "RECIPIENT_MISMATCH",
      "Recipient public key does not derive to the requested Ethereum address",
    );
  }

  const plaintext = Buffer.from(`${canonicalJson(payload)}\n`, "utf8");
  const randomBytes = dependencies.randomBytes ?? nodeRandomBytes;
  const dataKey = Buffer.from(randomBytes(32));
  const nonce = Buffer.from(randomBytes(12));
  if (dataKey.length !== 32 || nonce.length !== 12) {
    dataKey.fill(0);
    fail("RANDOMNESS_FAILURE", "Secure randomness returned an invalid length");
  }

  try {
    const cipher = createCipheriv("aes-256-gcm", dataKey, nonce, {
      authTagLength: 16,
    });
    cipher.setAAD(Buffer.from(PAYLOAD_AAD, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Verify the exact in-memory envelope before the key is wrapped and erased.
    const decipher = createDecipheriv("aes-256-gcm", dataKey, nonce, {
      authTagLength: 16,
    });
    decipher.setAAD(Buffer.from(PAYLOAD_AAD, "utf8"));
    decipher.setAuthTag(tag);
    const recovered = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    if (
      recovered.length !== plaintext.length ||
      !timingSafeEqual(recovered, plaintext)
    ) {
      fail("ENCRYPTION_FAILURE", "AES-GCM recovery verification failed");
    }

    const sealedKey = await runtime.wrapKey(
      Uint8Array.from(dataKey),
      normalizedPublicKey,
      runtime.storageSdk,
    );
    if (!(sealedKey instanceof Uint8Array) || sealedKey.length <= 50) {
      fail("KEY_WRAP_FAILURE", "0G ECIES returned an invalid wrapped key");
    }
    let keyRecoveryTested = false;
    if (dependencies.recoveryPrivateKey !== undefined) {
      if (
        runtime.ethers
          .computeAddress(dependencies.recoveryPrivateKey)
          .toLowerCase() !== normalizedAddress
      ) {
        fail(
          "RECIPIENT_MISMATCH",
          "Recovery private key does not match the recipient address",
        );
      }
      let wrappingKey;
      let recoveredKey;
      try {
        const header = runtime.storageSdk.parseEncryptionHeader(sealedKey);
        wrappingKey = runtime.storageSdk.deriveEciesDecryptKey(
          dependencies.recoveryPrivateKey,
          header.ephemeralPub,
        );
        recoveredKey = runtime.storageSdk.decryptFile(wrappingKey, sealedKey);
        if (
          recoveredKey.length !== dataKey.length ||
          !timingSafeEqual(Buffer.from(recoveredKey), dataKey)
        ) {
          fail(
            "KEY_RECOVERY_FAILURE",
            "Wrapped-key recovery verification failed",
          );
        }
        keyRecoveryTested = true;
      } finally {
        wrappingKey?.fill?.(0);
        recoveredKey?.fill?.(0);
      }
    }

    const envelope = Object.freeze({
      schemaVersion: 1,
      type: "rivergate-agentic-id-intelligence",
      encryption: Object.freeze({
        algorithm: "AES-256-GCM",
        aad: PAYLOAD_AAD,
        nonce: nonce.toString("base64"),
        authenticationTag: tag.toString("base64"),
      }),
      ciphertext: ciphertext.toString("base64"),
    });
    const ciphertextBytes = Buffer.from(`${canonicalJson(envelope)}\n`, "utf8");
    return Object.freeze({
      ciphertextBytes,
      sealedKey: Uint8Array.from(sealedKey),
      recipientAddress: normalizedAddress,
      recipientFingerprint: createHash("sha256")
        .update(normalizedPublicKey)
        .digest("hex"),
      keyRecoveryTested,
      plaintextBytes: plaintext.length,
      ciphertextBytesLength: ciphertextBytes.length,
      ciphertextSha256: createHash("sha256")
        .update(ciphertextBytes)
        .digest("hex"),
    });
  } catch (error) {
    if (error instanceof IntelligenceEncryptionError) throw error;
    fail("ENCRYPTION_FAILURE", "Intelligence encryption failed");
  } finally {
    dataKey.fill(0);
  }
}

export async function prepareStorage(
  encrypted,
  { broadcast, sponsorPrivateKey },
  dependencies = {},
) {
  const runtime = await loadStorageRuntime(dependencies);
  const data = new runtime.storageSdk.MemData(
    Uint8Array.from(encrypted.ciphertextBytes),
  );
  try {
    const [tree, treeError] = await data.merkleTree();
    if (treeError !== null || tree === null) {
      fail("MERKLE_FAILURE", "0G Storage could not build the Merkle tree");
    }
    const rootHash = tree.rootHash();
    if (typeof rootHash !== "string" || !BYTES32.test(rootHash)) {
      fail("MERKLE_FAILURE", "0G Storage returned an invalid Merkle root");
    }
    if (!broadcast) {
      return Object.freeze({ mode: "simulate", rootHash });
    }
    if (
      typeof sponsorPrivateKey !== "string" ||
      sponsorPrivateKey.length === 0
    ) {
      fail(
        "SIGNER_UNAVAILABLE",
        "Broadcast requires the server-side sponsor signer",
      );
    }

    const provider = new runtime.ethers.JsonRpcProvider(MAINNET.rpcUrl);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== MAINNET.chainId) {
      fail("NETWORK_MISMATCH", "RPC returned an unexpected chain");
    }
    const signer = new runtime.ethers.Wallet(sponsorPrivateKey, provider);
    const indexer = new runtime.storageSdk.Indexer(MAINNET.indexerUrl);
    const [uploader, uploaderError] = await indexer.newUploaderFromIndexerNodes(
      MAINNET.rpcUrl,
      signer,
      1,
    );
    if (uploaderError !== null || uploader === null) {
      fail("UPLOAD_FAILURE", "0G Storage could not prepare the uploader");
    }
    if (
      typeof uploader.flow?.target !== "string" ||
      uploader.flow.target.toLowerCase() !== MAINNET.flowAddress
    ) {
      fail(
        "NETWORK_MISMATCH",
        "0G Storage selected an unexpected Flow contract",
      );
    }
    const [response, uploadError] = await uploader.splitableUpload(data, {
      expectedReplica: 1,
      finalityRequired: true,
      skipIfFinalized: true,
    });
    if (uploadError !== null) {
      fail("UPLOAD_FAILURE", "0G Storage upload failed");
    }
    const upload = parseSingleUploadResponse(response, rootHash);

    const [blob, downloadError] = await indexer.downloadToBlob(rootHash, {
      proof: true,
    });
    if (downloadError !== null || blob === null) {
      fail("DOWNLOAD_FAILURE", "0G Storage proof download failed");
    }
    const downloaded = new Uint8Array(await blob.arrayBuffer());
    const expected = encrypted.ciphertextBytes;
    if (
      downloaded.length !== expected.length ||
      !timingSafeEqual(Buffer.from(downloaded), Buffer.from(expected))
    ) {
      fail(
        "DOWNLOAD_MISMATCH",
        "Downloaded ciphertext does not match the upload",
      );
    }
    return Object.freeze({
      mode: "broadcast",
      rootHash,
      transactionHash: upload.transactionHash,
      transactionSequence: upload.transactionSequence,
      finalized: true,
      downloadVerified: true,
    });
  } catch (error) {
    if (error instanceof IntelligenceEncryptionError) throw error;
    fail("STORAGE_FAILURE", "0G Storage operation failed");
  } finally {
    try {
      await data.close?.();
    } catch {
      // No resource owned by the caller remains open.
    }
  }
}

export function buildStorageManifest(
  encrypted,
  storage,
  dataDescription,
  keyRecoveryTested,
) {
  if (storage.mode !== "broadcast") {
    fail("FINALITY_REQUIRED", "A mint manifest requires a finalized upload");
  }
  if (typeof dataDescription !== "string" || dataDescription.trim() === "") {
    fail("INVALID_ARGUMENT", "A non-empty data description is required");
  }
  if (keyRecoveryTested !== true) {
    fail(
      "RECOVERY_NOT_CONFIRMED",
      "A mint manifest requires a completed offline wrapped-key recovery test",
    );
  }
  return Object.freeze({
    schemaVersion: 1,
    network: MAINNET.network,
    chainId: MAINNET.chainId,
    rootHash: storage.rootHash,
    transactionHash: storage.transactionHash,
    finalized: true,
    downloadVerified: true,
    ciphertextOnlyUploaded: true,
    keyRecoveryTested: true,
    dataDescription,
    recipientFingerprint: encrypted.recipientFingerprint,
  });
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined)
    fail("INVALID_PAYLOAD", "Payload is not valid JSON");
  return encoded;
}

async function officialWrapKey(key, recipientPublicKey, storageSdk) {
  const keyCopy = Uint8Array.from(key);
  try {
    const encrypted = storageSdk.newEciesEncryptedFile(
      new storageSdk.MemData(keyCopy),
      recipientPublicKey,
    );
    const result = await encrypted.readFromFile(0, encrypted.size());
    if (result.bytesRead !== encrypted.size()) {
      fail("KEY_WRAP_FAILURE", "0G ECIES returned a truncated wrapped key");
    }
    return Uint8Array.from(result.buffer);
  } finally {
    keyCopy.fill(0);
  }
}

async function loadCryptoRuntime(dependencies) {
  const storageSdk =
    dependencies.storageSdk ??
    (await loadWorkspacePackage("@0gfoundation/0g-storage-ts-sdk"));
  const ethersModule =
    dependencies.ethers ?? (await loadWorkspacePackage("ethers"));
  const ethers = ethersModule.ethers ?? ethersModule;
  if (
    typeof storageSdk.normalizePubKey !== "function" ||
    typeof storageSdk.newEciesEncryptedFile !== "function" ||
    typeof storageSdk.parseEncryptionHeader !== "function" ||
    typeof storageSdk.deriveEciesDecryptKey !== "function" ||
    typeof storageSdk.decryptFile !== "function" ||
    typeof storageSdk.MemData !== "function" ||
    typeof ethers.computeAddress !== "function"
  ) {
    fail(
      "SDK_UNAVAILABLE",
      "Installed 0G cryptography runtime is incompatible",
    );
  }
  return Object.freeze({
    storageSdk,
    ethers,
    wrapKey: dependencies.wrapKey ?? officialWrapKey,
  });
}

async function loadStorageRuntime(dependencies) {
  const cryptoRuntime = await loadCryptoRuntime(dependencies);
  if (
    typeof cryptoRuntime.storageSdk.Indexer !== "function" ||
    typeof cryptoRuntime.ethers.JsonRpcProvider !== "function" ||
    typeof cryptoRuntime.ethers.Wallet !== "function"
  ) {
    fail("SDK_UNAVAILABLE", "Installed 0G Storage runtime is incompatible");
  }
  return cryptoRuntime;
}

async function loadWorkspacePackage(name) {
  try {
    const require = createRequire(
      new URL("../../packages/zero-g/package.json", import.meta.url),
    );
    return require(name);
  } catch {
    fail("SDK_UNAVAILABLE", "Installed 0G Storage runtime is unavailable");
  }
}

function parseSingleUploadResponse(value, calculatedRootHash) {
  if (
    !isPlainRecord(value) ||
    !Array.isArray(value.rootHashes) ||
    !Array.isArray(value.txHashes) ||
    !Array.isArray(value.txSeqs) ||
    value.rootHashes.length !== 1 ||
    value.txHashes.length !== 1 ||
    value.txSeqs.length !== 1 ||
    typeof value.rootHashes[0] !== "string" ||
    value.rootHashes[0].toLowerCase() !== calculatedRootHash.toLowerCase() ||
    typeof value.txHashes[0] !== "string" ||
    !BYTES32.test(value.txHashes[0]) ||
    !Number.isSafeInteger(value.txSeqs[0]) ||
    value.txSeqs[0] < 0
  ) {
    fail("UPLOAD_FAILURE", "0G Storage returned an invalid upload receipt");
  }
  return Object.freeze({
    transactionHash: value.txHashes[0],
    transactionSequence: value.txSeqs[0],
  });
}

function parseArgs(argv) {
  const options = { broadcast: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--broadcast") options.broadcast = true;
    else if (
      [
        "--input",
        "--recipient-address",
        "--recipient-public-key",
        "--manifest",
        "--ciphertext-out",
        "--wrapped-key-out",
        "--data-description",
      ].includes(argument)
    ) {
      const value = argv[++index];
      if (!value) fail("INVALID_ARGUMENT", `${argument} requires a value`);
      options[argument.slice(2)] = value;
    } else {
      fail("INVALID_ARGUMENT", `Unsupported argument: ${argument}`);
    }
  }
  for (const name of [
    "input",
    "recipient-address",
    "recipient-public-key",
    "ciphertext-out",
    "wrapped-key-out",
  ]) {
    if (!options[name]) fail("INVALID_ARGUMENT", `--${name} is required`);
  }
  if (options.broadcast && !options.manifest) {
    fail("INVALID_ARGUMENT", "Broadcast requires --manifest");
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  for (const output of [
    options["ciphertext-out"],
    options["wrapped-key-out"],
    options.manifest,
  ].filter(Boolean)) {
    assertOperatorOutputPath(output);
  }
  const recipient = {
    address: options["recipient-address"],
    publicKey: options["recipient-public-key"],
  };
  const sponsorPrivateKey = options.broadcast
    ? process.env.ZERO_G_SPONSOR_PRIVATE_KEY
    : undefined;
  if (options.broadcast && !sponsorPrivateKey) {
    fail(
      "SIGNER_UNAVAILABLE",
      "Broadcast requires the server-side sponsor signer",
    );
  }
  const encrypted = await prepareArtifacts(options.input, recipient, {
    recoveryPrivateKey: sponsorPrivateKey,
  });
  await writeFile(options["ciphertext-out"], encrypted.ciphertextBytes, {
    flag: "wx",
    mode: 0o600,
  });
  await writeFile(
    options["wrapped-key-out"],
    `0x${Buffer.from(encrypted.sealedKey).toString("hex")}\n`,
    { flag: "wx", mode: 0o600 },
  );
  const storage = await prepareStorage(encrypted, {
    broadcast: options.broadcast,
    sponsorPrivateKey,
  });
  if (storage.mode === "broadcast") {
    const manifest = buildStorageManifest(
      encrypted,
      storage,
      options["data-description"] ??
        "Rivergate encrypted agent intelligence on 0G Storage",
      encrypted.keyRecoveryTested,
    );
    await writeFile(
      options.manifest,
      `${JSON.stringify(manifest, null, 2)}\n`,
      {
        flag: "wx",
        mode: 0o600,
      },
    );
  }

  console.log(
    JSON.stringify({
      mode: storage.mode,
      network: MAINNET.network,
      chainId: MAINNET.chainId,
      rootHash: storage.rootHash,
      transactionHash: storage.transactionHash ?? null,
      finalized: storage.finalized ?? false,
      downloadVerified: storage.downloadVerified ?? false,
      ciphertextSha256: encrypted.ciphertextSha256,
      ciphertextBytes: encrypted.ciphertextBytesLength,
      recipientAddress: encrypted.recipientAddress,
      recipientFingerprint: encrypted.recipientFingerprint,
      keyRecoveryTested: encrypted.keyRecoveryTested,
      manifest: storage.mode === "broadcast" ? options.manifest : null,
      ciphertextFile: options["ciphertext-out"],
      wrappedKeyFile: options["wrapped-key-out"],
    }),
  );
}

function assertOperatorOutputPath(outputPath) {
  if (typeof outputPath !== "string" || !path.isAbsolute(outputPath)) {
    fail("INVALID_ARGUMENT", "Output paths must be absolute operator paths");
  }
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const resolved = path.resolve(outputPath);
  if (
    resolved === repositoryRoot ||
    resolved.startsWith(`${repositoryRoot}${path.sep}`)
  ) {
    fail(
      "INVALID_ARGUMENT",
      "Encryption artifacts must be written outside the repository",
    );
  }
}

async function prepareArtifacts(inputPath, recipient, dependencies = {}) {
  const inputInfo = await stat(inputPath);
  if (
    !inputInfo.isFile() ||
    inputInfo.size < 2 ||
    inputInfo.size > MAX_INPUT_BYTES
  ) {
    fail(
      "INVALID_PAYLOAD",
      "Input must be a non-empty JSON file no larger than 1 MiB",
    );
  }
  let payload;
  try {
    payload = JSON.parse(await readFile(inputPath, "utf8"));
  } catch {
    fail("INVALID_PAYLOAD", "Input is not valid JSON");
  }
  return encryptIntelligence(payload, recipient, dependencies);
}

function normalizeAddress(value) {
  if (typeof value !== "string" || !ADDRESS.test(value)) {
    fail("INVALID_RECIPIENT", "Recipient address is invalid");
  }
  return value.toLowerCase();
}

function assertJsonPayload(value) {
  if (!isPlainRecord(value) && !Array.isArray(value)) {
    fail(
      "INVALID_PAYLOAD",
      "Intelligence payload must be a JSON object or array",
    );
  }
  // Canonicalization also rejects undefined and non-JSON leaf values.
  canonicalJson(value);
}

function isPlainRecord(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function fail(code, message) {
  throw new IntelligenceEncryptionError(code, message);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const safe =
      error instanceof IntelligenceEncryptionError
        ? `${error.code}: ${error.message}`
        : "UNEXPECTED_FAILURE: Intelligence encryption failed";
    console.error(safe);
    process.exitCode = 1;
  });
}
