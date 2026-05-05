import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  RekognitionClient,
  DetectFacesCommand,
} from "@aws-sdk/client-rekognition";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const rekognition = new RekognitionClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const SESSIONS_TABLE = process.env.SESSIONS_TABLE_NAME!;
const VIDEO_BUCKET = process.env.VIDEO_S3_BUCKET!;
const DEFAULT_YAW_THRESHOLD = 20;
const CONSECUTIVE_FRAMES_REQUIRED = 3;

interface ChallengeFrame {
  image: string; // base64 encoded JPEG
  timestamp: number;
}

interface ValidateRequest {
  sessionId: string;
  createdAt: string;
  challengeType: string;
  frames: ChallengeFrame[];
}

async function detectFaceYaw(imageBytes: Buffer): Promise<number | null> {
  const result = await rekognition.send(
    new DetectFacesCommand({
      Image: { Bytes: imageBytes },
      Attributes: ["ALL"],
    })
  );
  const face = result.FaceDetails?.[0];
  if (!face?.Pose?.Yaw) return null;
  return face.Pose.Yaw;
}

function getThresholdForChallenge(
  challengeType: string
): { axis: "yaw" | "pitch"; direction: "positive" | "negative"; threshold: number } {
  switch (challengeType) {
    case "head-left":
      return { axis: "yaw", direction: "negative", threshold: DEFAULT_YAW_THRESHOLD };
    case "head-right":
      return { axis: "yaw", direction: "positive", threshold: DEFAULT_YAW_THRESHOLD };
    case "head-up":
      return { axis: "pitch", direction: "positive", threshold: DEFAULT_YAW_THRESHOLD };
    case "head-down":
      return { axis: "pitch", direction: "negative", threshold: DEFAULT_YAW_THRESHOLD };
    default:
      return { axis: "yaw", direction: "negative", threshold: DEFAULT_YAW_THRESHOLD };
  }
}

function frameMeetsThreshold(
  value: number,
  direction: "positive" | "negative",
  threshold: number
): boolean {
  if (direction === "negative") return value <= -threshold;
  return value >= threshold;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const body: ValidateRequest = JSON.parse(event.body ?? "{}");
    const { sessionId, createdAt, challengeType, frames } = body;

    if (!sessionId || !frames?.length) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing sessionId or frames" }),
      };
    }

    const { direction, threshold } = getThresholdForChallenge(challengeType);

    let consecutivePasses = 0;
    let maxConsecutive = 0;
    let bestScore = 0;
    const frameResults: { timestamp: number; yaw: number | null; passed: boolean }[] = [];

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const imageBytes = Buffer.from(frame.image, "base64");

      // Store frame in S3
      await s3.send(
        new PutObjectCommand({
          Bucket: VIDEO_BUCKET,
          Key: `${sessionId}/frames/${challengeType}-${frame.timestamp}.jpg`,
          Body: imageBytes,
          ContentType: "image/jpeg",
        })
      );

      const yaw = await detectFaceYaw(imageBytes);
      const passed = yaw !== null && frameMeetsThreshold(yaw, direction, threshold);

      if (passed) {
        consecutivePasses++;
        maxConsecutive = Math.max(maxConsecutive, consecutivePasses);
        if (yaw !== null) bestScore = Math.max(bestScore, Math.abs(yaw));
      } else {
        consecutivePasses = 0;
      }

      frameResults.push({ timestamp: frame.timestamp, yaw, passed });
    }

    const challengePassed = maxConsecutive >= CONSECUTIVE_FRAMES_REQUIRED;

    await ddb.send(
      new UpdateCommand({
        TableName: SESSIONS_TABLE,
        Key: { sessionId, createdAt },
        UpdateExpression:
          "SET challenges = list_append(if_not_exists(challenges, :empty), :challenge)",
        ExpressionAttributeValues: {
          ":empty": [],
          ":challenge": [
            {
              type: challengeType,
              passed: challengePassed,
              bestScore,
              framesAnalyzed: frames.length,
              consecutiveFrames: maxConsecutive,
              threshold,
              completedAt: new Date().toISOString(),
            },
          ],
        },
      })
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passed: challengePassed,
        bestScore,
        consecutiveFrames: maxConsecutive,
        requiredConsecutive: CONSECUTIVE_FRAMES_REQUIRED,
        threshold,
        framesAnalyzed: frames.length,
        hint: challengePassed
          ? null
          : "Turn your head further to the left",
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
