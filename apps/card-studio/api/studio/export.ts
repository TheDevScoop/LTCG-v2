import type { VercelRequest, VercelResponse } from "@vercel/node";
import JSZip from "jszip";
import * as z from "zod";
import {
  CardProjectV1Schema,
  GeneratedCardBundleV1Schema,
  validateStudioBundle,
} from "@lunchtable-tcg/card-studio-sdk";
import { enforcePost, readJsonBody } from "../_lib/http";
import { buildBundleFromProject } from "../../shared/bundle";

const ExportSchema = z.object({
  project: CardProjectV1Schema,
  bundle: GeneratedCardBundleV1Schema.optional(),
});

function decodeDataUri(dataUri: string): Buffer {
  const [, encoded] = dataUri.split(",");
  return Buffer.from(encoded ?? "", "base64");
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!enforcePost(request, response)) return;

  try {
    const body = ExportSchema.parse(readJsonBody(request));
    const bundle = body.bundle ?? buildBundleFromProject(body.project);
    const validation = validateStudioBundle(bundle);
    if (!validation.success) {
      response.status(400).json({ errors: validation.errors });
      return;
    }

    const zip = new JSZip();
    zip.file("project.studio.json", JSON.stringify(body.project, null, 2));
    zip.file("bundle.studio.json", JSON.stringify(bundle, null, 2));
    zip.file("studio.bundle.json", JSON.stringify(bundle, null, 2));
    zip.file("code/CardTemplate.tsx", bundle.generatedCode.cardTemplateTsx);
    zip.file("code/index.ts", bundle.generatedCode.indexTs);
    zip.file("styles/tokens.css", bundle.cssTokens);
    zip.file("sdk/types.ts", bundle.sdkArtifacts.typesTs);
    zip.file("sdk/validators.ts", bundle.sdkArtifacts.validatorsTs);
    zip.file("manifest.checksums.json", JSON.stringify(bundle.manifest, null, 2));

    for (const asset of bundle.assets) {
      zip.file(asset.fileName, decodeDataUri(asset.dataUri));
    }

    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    response.setHeader("Content-Type", "application/zip");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${body.project.name.replace(/\s+/g, "-").toLowerCase()}-studio-export.zip\"`,
    );
    response.status(200).send(archive);
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : "Unable to export bundle" });
  }
}
