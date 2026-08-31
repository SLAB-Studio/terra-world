import "server-only";

import {
  createZeroGComputeClient,
  type ZeroGComputeClient,
} from "../../../../../../packages/zero-g/src/server/compute";
import {
  isZeroGRequired,
  loadZeroGComputeConfig,
} from "../../../../../../packages/zero-g/src/server/config";

import {
  createChallengeHintPostHandler,
  createPrivateZeroGChallengeHintProvider,
} from "./server";

let computeClient: ZeroGComputeClient | undefined;

export const runtime = "nodejs";

const lazyComputeClient: ZeroGComputeClient = Object.freeze({
  async createChatCompletion(input, options) {
    computeClient ??= createZeroGComputeClient(
      loadZeroGComputeConfig(process.env),
    );
    return computeClient.createChatCompletion(input, options);
  },
});

export const POST = createChallengeHintPostHandler({
  callProvider: createPrivateZeroGChallengeHintProvider(lazyComputeClient),
  required: isZeroGRequired(process.env),
});
