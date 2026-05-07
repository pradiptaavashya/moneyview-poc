import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  RekognitionClient,
  DetectFacesCommand,
  type FaceDetail,
} from "@aws-sdk/client-rekognition";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const rekognition = new RekognitionClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const SESSIONS_TABLE = process.env.SESSIONS_TABLE_NAME!;
const VIDEO_BUCKET = process.env.VIDEO_S3_BUCKET!;
const DEFAULT_ANGLE_THRESHOLD = 5;
const DEFAULT_EXPRESSION_THRESHOLD = 40;
const CONSECUTIVE_FRAMES_REQUIRED = 1;

interface ChallengeFrame {
  image: string;
  timestamp: number;
}

interface ValidateRequest {
  sessionId: string;
  createdAt: string;
  challengeType: string;
  frames: ChallengeFrame[];
}

type ChallengeType =
  | "head-left"
  | "head-right"
  | "head-up"
  | "head-down"
  | "smile"
  | "mouth-open";

const HINTS: Record<ChallengeType, string> = {
  "head-left": "Turn your head further to the left",
  "head-right": "Turn your head further to the right",
  "head-up": "Tilt your head further up",
  "head-down": "Tilt your head further down",
  smile: "Smile wider",
  "mouth-open": "Open your mouth wider",
};

async function detectFace(imageBytes: Buffer): Promise<FaceDetail | null> {
  const result = await rekognition.send(
    new DetectFacesCommand({
      Image: { Bytes: imageBytes },
      Attributes: ["ALL"],
    })
  );
  return result.FaceDetails?.[0] ?? null;
}

function evaluateChallenge(
  face: FaceDetail,
  challengeType: ChallengeType
): { passed: boolean; score: number } {
  switch (challengeType) {
    case "head-left": {
      const yaw = face.Pose?.Yaw ?? 0;
      return { passed: yaw >= DEFAULT_ANGLE_THRESHOLD, score: Math.abs(yaw) };
    }
    case "head-right": {
      const yaw = face.Pose?.Yaw ?? 0;
      return { passed: yaw <= -DEFAULT_ANGLE_THRESHOLD, score: Math.abs(yaw) };
    }
    case "head-up": {
      const pitch = face.Pose?.Pitch ?? 0;
      return { passed: pitch >= DEFAULT_ANGLE_THRESHOLD, score: Math.abs(pitch) };
    }
    case "head-down": {
      const pitch = face.Pose?.Pitch ?? 0;
      return { passed: pitch <= -DEFAULT_ANGLE_THRESHOLD, score: Math.abs(pitch) };
    }
    case "smile": {
      const confidence = face.Smile?.Confidence ?? 0;
      const value = face.Smile?.Value ?? false;
      return {
        passed: value && confidence >= DEFAULT_EXPRESSION_THRESHOLD,
        score: confidence,
      };
    }
    case "mouth-open": {
      const confidence = face.MouthOpen?.Confidence ?? 0;
      const value = face.MouthOpen?.Value ?? false;
      return {
        passed: value && confidence >= DEFAULT_EXPRESSION_THRESHOLD,
        score: confidence,
      };
    }
  }
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

    const type = challengeType as ChallengeType;
    let consecutivePasses = 0;
    let maxConsecutive = 0;
    let bestScore = 0;

    for (const frame of frames) {
      const imageBytes = Buffer.from(frame.image, "base64");

      await s3.send(
        new PutObjectCommand({
          Bucket: VIDEO_BUCKET,
          Key: `${sessionId}/frames/${challengeType}-${frame.timestamp}.jpg`,
          Body: imageBytes,
          ContentType: "image/jpeg",
        })
      );

      const face = await detectFace(imageBytes);
      if (!face) {
        consecutivePasses = 0;
        continue;
      }

      const { passed, score } = evaluateChallenge(face, type);

      if (passed) {
        consecutivePasses++;
        maxConsecutive = Math.max(maxConsecutive, consecutivePasses);
        bestScore = Math.max(bestScore, score);
      } else {
        consecutivePasses = 0;
      }
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
        framesAnalyzed: frames.length,
        hint: challengePassed ? null : HINTS[type],
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
