import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  PromotionPayloadV1Schema,
  validateStudioBundle,
} from "@lunchtable-tcg/card-studio-sdk";
import { enforcePost, json, readJsonBody } from "../_lib/http";
import { convexMutation, createConvexClient } from "../_lib/convexClient";
import { validateBundleForPromotion } from "../_lib/promotion";
import { hashPromotionToken, redactSecrets } from "../../shared/security";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!enforcePost(request, response)) return;

  try {
    const payload = PromotionPayloadV1Schema.parse(readJsonBody(request));
    const bundleValidation = validateStudioBundle(payload.bundle);
    if (!bundleValidation.success) {
      json(response, 400, {
        status: "rejected",
        report: {
          errors: bundleValidation.errors,
        },
      });
      return;
    }

    const report = validateBundleForPromotion(bundleValidation.data);
    const tokenHash = hashPromotionToken(payload.promotionToken);

    const client = createConvexClient();

    if (report.errors.length > 0) {
      await convexMutation(client, "studio:recordPromotionResult", {
        promotionId: `promotion_${Date.now()}`,
        runId: payload.runId,
        tokenHash,
        status: "rejected",
        report,
      });

      json(response, 200, {
        status: "rejected",
        report,
      });
      return;
    }

    const stageResult = await convexMutation(client, "studio:stageBundleCards", {
      bundle: bundleValidation.data,
      promotionId: `promotion_${Date.now()}`,
      runId: payload.runId,
      tokenHash,
    });

    json(response, 200, {
      status: "staged",
      stagedCardIds: stageResult,
      report,
    });
  } catch (error) {
    const payload = redactSecrets(
      error instanceof Error ? { error: error.message } : { error: "promotion failed" },
    );
    json(response, 400, payload);
  }
}
