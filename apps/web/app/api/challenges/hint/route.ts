import "server-only";

import {
  createZeroGComputeClient,
  type ZeroGComputeClient,
} from "../../../../../../packages/zero-g/src/server/compute";
import { loadZeroGServerConfig } from "../../../../../../packages/zero-g/src/server/config";

import {
  createChallengeHintPostHandler,
  createPrivateZeroGChallengeHintProvider,
} from "./server";

let computeClient: ZeroGComputeClient | undefined;

export const runtime = "nodejs";

const lazyComputeClient: ZeroGComputeClient = Object.freeze({
  async createChatCompletion(input) {
    computeClient ??= createZeroGComputeClient(
      loadZeroGServerConfig(process.env),
    );
    return computeClient.createChatCompletion(input);
  },
});

export const POST = createChallengeHintPostHandler({
  callProvider: createPrivateZeroGChallengeHintProvider(lazyComputeClient),
});
