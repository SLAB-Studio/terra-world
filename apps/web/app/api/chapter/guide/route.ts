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
  CHAPTER_GUIDE_LIMITS,
  createChapterGuidePostHandler,
  createPrivateChapterGuideProvider,
} from "./server";

export const runtime = "nodejs";
let computeClient: ZeroGComputeClient | undefined;

const client: ZeroGComputeClient = {
  async createChatCompletion(input, options) {
    if (!computeClient) {
      const configured = loadZeroGComputeConfig(process.env);
      // One paid attempt per uncached briefing; the Compute fetch owns abortion.
      computeClient = createZeroGComputeClient({
        ...configured,
        request: {
          timeoutMs: Math.min(
            configured.request.timeoutMs,
            CHAPTER_GUIDE_LIMITS.providerTimeoutMs,
          ),
          maxRetries: 0,
        },
      });
    }
    return computeClient.createChatCompletion(input, options);
  },
};

export const POST = createChapterGuidePostHandler({
  callProvider: createPrivateChapterGuideProvider(client),
  required: isZeroGRequired(process.env),
});
