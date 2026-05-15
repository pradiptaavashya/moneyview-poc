import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({});
const VIDEO_BUCKET = process.env.VIDEO_S3_BUCKET!;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const sessionId = event.pathParameters?.id;
    const body = JSON.parse(event.body ?? "{}");
    const { action } = body;

    if (!sessionId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing session ID" }),
      };
    }

    const contentType = body.contentType || "video/webm";
    const ext = contentType.includes("mp4") ? "mp4" : "webm";
    const dateKey = body.createdAt
      ? new Date(body.createdAt).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
    const key = `${dateKey}/${sessionId}/video.${ext}`;

    if (action === "get") {
      // Try both extensions for playback
      const webmKey = `${dateKey}/${sessionId}/video.webm`;
      const mp4Key = `${dateKey}/${sessionId}/video.mp4`;
      const tryKey = ext === "mp4" ? mp4Key : webmKey;
      const command = new GetObjectCommand({ Bucket: VIDEO_BUCKET, Key: tryKey });
      const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, key: tryKey }),
      };
    }

    // Default: generate presigned PUT URL for upload
    const command = new PutObjectCommand({
      Bucket: VIDEO_BUCKET,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadUrl, key }),
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
