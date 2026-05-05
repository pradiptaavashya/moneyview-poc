import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});
const REFERENCE_BUCKET = process.env.REFERENCE_DOC_S3_BUCKET!;

// Known C2PA / AI-tool EXIF signatures
const AI_SIGNATURES = [
  "c2pa", "contentcredentials", "made with ai",
  "dall-e", "midjourney", "stable diffusion",
  "grok", "gemini", "ai generated", "ai_generated",
  "synthetic", "generative",
];

function checkForAISignatures(buffer: Buffer): { detected: boolean; tool: string | null } {
  // Scan for C2PA manifest (JUMBF box) or EXIF AI tags
  const str = buffer.toString("latin1").toLowerCase();

  for (const sig of AI_SIGNATURES) {
    if (str.includes(sig)) {
      return { detected: true, tool: sig };
    }
  }
  return { detected: false, tool: null };
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body ?? "{}");
    const { key, sessionId } = body;

    if (!key) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing key" }),
      };
    }

    const obj = await s3.send(
      new GetObjectCommand({ Bucket: REFERENCE_BUCKET, Key: key })
    );

    const bodyBytes = await obj.Body?.transformToByteArray();
    if (!bodyBytes) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Could not read file" }),
      };
    }

    const buffer = Buffer.from(bodyBytes);
    const { detected, tool } = checkForAISignatures(buffer);

    // Reference documents with AI watermarks are hard-blocked
    const blocked = detected;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocked,
        detected,
        tool,
        context: "reference-document",
        sessionId,
      }),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: message }),
    };
  }
};
