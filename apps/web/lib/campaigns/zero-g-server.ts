import type { CampaignPackage } from "@terra/campaign-schema";
import {
  RIVERGATE_CAMPAIGN_PACKAGE_ID,
  RIVERGATE_CAMPAIGN_PACKAGE_VERSION,
  RIVERGATE_CAMPAIGN_V1_HASH,
  loadRivergateCampaignPackage,
  serializeRivergateCampaignPackage,
} from "@terra/simulation";

import {
  ZeroGStorageError,
  type ZeroGStorageAdapter,
} from "../../../../packages/zero-g/src/server/storage";

const ROOT_HASH = /^0x[0-9a-f]{64}$/u;
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/u;
const canonicalPackageText = serializeRivergateCampaignPackage();
const canonicalPackageBytes = new TextEncoder().encode(canonicalPackageText);

export type RivergateCampaignReference = Readonly<{
  schemaVersion: 1;
  packageId: typeof RIVERGATE_CAMPAIGN_PACKAGE_ID;
  packageVersion: typeof RIVERGATE_CAMPAIGN_PACKAGE_VERSION;
  packageHash: typeof RIVERGATE_CAMPAIGN_V1_HASH;
  rootHash: `0x${string}`;
  contentHash: `sha256:${string}`;
  byteLength: number;
}>;

export type RivergateCampaignPublication = Readonly<{
  reference: RivergateCampaignReference;
  transactionHash: `0x${string}`;
}>;

export type RetrievedRivergateCampaign = Readonly<{
  campaignPackage: CampaignPackage;
  reference: RivergateCampaignReference;
  proofVerified: true;
}>;

export type RivergateCampaignStorageCommand = Readonly<{
  publish(): Promise<RivergateCampaignPublication>;
  retrieve(reference: unknown): Promise<RetrievedRivergateCampaign>;
  publishAndVerify(): Promise<
    Readonly<{
      publication: RivergateCampaignPublication;
      retrieval: RetrievedRivergateCampaign;
    }>
  >;
}>;

export type RivergateCampaignStorageErrorCode =
  | "INVALID_REFERENCE"
  | "PUBLICATION_FAILED"
  | "RETRIEVAL_FAILED"
  | "INTEGRITY_MISMATCH";

export class RivergateCampaignStorageError extends Error {
  readonly code: RivergateCampaignStorageErrorCode;
  readonly retryable: boolean;

  constructor(
    code: RivergateCampaignStorageErrorCode,
    message: string,
    retryable = false,
  ) {
    super(message);
    this.name = "RivergateCampaignStorageError";
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * Composes the official Rivergate package with two server-side Storage
 * adapters. Supplying an independently created reader proves that the stored
 * root is sufficient for a fresh application process to recover the package.
 */
export function createRivergateCampaignStorageCommand(input: {
  readonly publisher: ZeroGStorageAdapter;
  readonly freshReader: ZeroGStorageAdapter;
}): RivergateCampaignStorageCommand {
  assertServerRuntime();

  const publish = async (): Promise<RivergateCampaignPublication> => {
    let receipt: Awaited<ReturnType<ZeroGStorageAdapter["upload"]>>;
    try {
      receipt = await input.publisher.upload({
        kind: "campaign-package",
        bytes: canonicalPackageBytes,
      });
    } catch (error) {
      throw safeStorageFailure(error, "PUBLICATION_FAILED");
    }

    if (
      receipt.kind !== "campaign-package" ||
      receipt.byteLength !== canonicalPackageBytes.byteLength
    ) {
      throw new RivergateCampaignStorageError(
        "INTEGRITY_MISMATCH",
        "0G publication receipt does not match Rivergate v1",
      );
    }

    const reference = freezeReference({
      schemaVersion: 1,
      packageId: RIVERGATE_CAMPAIGN_PACKAGE_ID,
      packageVersion: RIVERGATE_CAMPAIGN_PACKAGE_VERSION,
      packageHash: RIVERGATE_CAMPAIGN_V1_HASH,
      rootHash: receipt.rootHash,
      contentHash: receipt.contentHash,
      byteLength: receipt.byteLength,
    });
    return Object.freeze({
      reference,
      transactionHash: receipt.transactionHash,
    });
  };

  const retrieve = async (
    referenceInput: unknown,
  ): Promise<RetrievedRivergateCampaign> => {
    const reference = parseReference(referenceInput);
    let retrieval: Awaited<ReturnType<ZeroGStorageAdapter["retrieve"]>>;
    try {
      retrieval = await input.freshReader.retrieve({
        rootHash: reference.rootHash,
        expectedContentHash: reference.contentHash,
        campaign: {
          expectedPackageHash: RIVERGATE_CAMPAIGN_V1_HASH,
          inspectPackageHash: inspectRivergatePackageHash,
        },
      });
    } catch (error) {
      throw safeStorageFailure(error, "RETRIEVAL_FAILED");
    }

    if (
      retrieval.proofVerified !== true ||
      retrieval.rootHash !== reference.rootHash ||
      retrieval.contentHash !== reference.contentHash ||
      retrieval.packageHash !== RIVERGATE_CAMPAIGN_V1_HASH ||
      retrieval.bytes.byteLength !== reference.byteLength
    ) {
      throw new RivergateCampaignStorageError(
        "INTEGRITY_MISMATCH",
        "Retrieved Rivergate evidence does not match its publication reference",
      );
    }

    const decoded = decodePackage(retrieval.bytes);
    if (decoded !== canonicalPackageText) {
      throw new RivergateCampaignStorageError(
        "INTEGRITY_MISMATCH",
        "Retrieved Rivergate bytes are not the canonical v1 package",
      );
    }
    const campaignPackage = parseRivergatePackage(decoded);

    return Object.freeze({
      campaignPackage,
      reference,
      proofVerified: true as const,
    });
  };

  return Object.freeze({
    publish,
    retrieve,
    async publishAndVerify() {
      const publication = await publish();
      const retrieval = await retrieve(publication.reference);
      return Object.freeze({ publication, retrieval });
    },
  });
}

function inspectRivergatePackageHash(bytes: Uint8Array): string {
  return parseRivergatePackage(decodePackage(bytes)).packageHash;
}

function parseRivergatePackage(text: string): CampaignPackage {
  try {
    return loadRivergateCampaignPackage(JSON.parse(text) as unknown);
  } catch {
    throw new RivergateCampaignStorageError(
      "INTEGRITY_MISMATCH",
      "Retrieved bytes are not the official Rivergate v1 package",
    );
  }
}

function decodePackage(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RivergateCampaignStorageError(
      "INTEGRITY_MISMATCH",
      "Retrieved Rivergate bytes are not valid UTF-8",
    );
  }
}

function parseReference(input: unknown): RivergateCampaignReference {
  if (!isRecord(input)) return invalidReference();
  const keys = Object.keys(input).sort();
  const expectedKeys = [
    "byteLength",
    "contentHash",
    "packageHash",
    "packageId",
    "packageVersion",
    "rootHash",
    "schemaVersion",
  ];
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    input.schemaVersion !== 1 ||
    input.packageId !== RIVERGATE_CAMPAIGN_PACKAGE_ID ||
    input.packageVersion !== RIVERGATE_CAMPAIGN_PACKAGE_VERSION ||
    input.packageHash !== RIVERGATE_CAMPAIGN_V1_HASH ||
    typeof input.rootHash !== "string" ||
    !ROOT_HASH.test(input.rootHash) ||
    typeof input.contentHash !== "string" ||
    !CONTENT_HASH.test(input.contentHash) ||
    input.byteLength !== canonicalPackageBytes.byteLength
  ) {
    return invalidReference();
  }

  return freezeReference({
    schemaVersion: 1,
    packageId: RIVERGATE_CAMPAIGN_PACKAGE_ID,
    packageVersion: RIVERGATE_CAMPAIGN_PACKAGE_VERSION,
    packageHash: RIVERGATE_CAMPAIGN_V1_HASH,
    rootHash: input.rootHash as `0x${string}`,
    contentHash: input.contentHash as `sha256:${string}`,
    byteLength: input.byteLength,
  });
}

function freezeReference(
  reference: RivergateCampaignReference,
): RivergateCampaignReference {
  return Object.freeze({ ...reference });
}

function invalidReference(): never {
  throw new RivergateCampaignStorageError(
    "INVALID_REFERENCE",
    "Rivergate campaign reference is invalid",
  );
}

function safeStorageFailure(
  error: unknown,
  code: "PUBLICATION_FAILED" | "RETRIEVAL_FAILED",
): RivergateCampaignStorageError {
  if (
    error instanceof ZeroGStorageError &&
    (error.code === "INTEGRITY_MISMATCH" ||
      error.code === "PROOF_VERIFICATION_FAILED")
  ) {
    return new RivergateCampaignStorageError(
      "INTEGRITY_MISMATCH",
      "Rivergate campaign integrity verification failed",
    );
  }
  return new RivergateCampaignStorageError(
    code,
    code === "PUBLICATION_FAILED"
      ? "Rivergate campaign publication failed"
      : "Rivergate campaign retrieval failed",
    error instanceof ZeroGStorageError && error.retryable,
  );
}

function assertServerRuntime(): void {
  if (typeof window !== "undefined") {
    throw new RivergateCampaignStorageError(
      "PUBLICATION_FAILED",
      "Rivergate campaign Storage commands are server-only",
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
