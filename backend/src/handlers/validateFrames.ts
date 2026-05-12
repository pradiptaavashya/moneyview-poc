import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  RekognitionClient,
  DetectFacesCommand,
  type FaceDetail,
} from "@aws-sdk/client-rekognition";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const rekognition = new RekognitionClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const SESSIONS_TABLE = process.env.SESSIONS_TABLE_NAME!;
const VIDEO_BUCKET = process.env.VIDEO_S3_BUCKET!;
const CONFIG_TABLE = process.env.CONFIG_TABLE_NAME!;

interface ChallengeConfig {
  headTurnAngle: number;
  smileThreshold: number;
  mouthOpenThreshold: number;
  consecutiveFrames: number;
}

const CONFIG_DEFAULTS: ChallengeConfig = {
  headTurnAngle: 20,
  smileThreshold: 80,
  mouthOpenThreshold: 80,
  consecutiveFrames: 3,
};

async function getConfig(): Promise<ChallengeConfig> {
  try {
    const result = await ddb.send(
      new GetCommand({ TableName: CONFIG_TABLE, Key: { pk: "config" } })
    );
    return {
      headTurnAngle: result.Item?.headTurnAngle ?? CONFIG_DEFAULTS.headTurnAngle,
      smileThreshold: result.Item?.smileThreshold ?? CONFIG_DEFAULTS.smileThreshold,
      mouthOpenThreshold: result.Item?.mouthOpenThreshold ?? CONFIG_DEFAULTS.mouthOpenThreshold,
      consecutiveFrames: result.Item?.consecutiveFrames ?? CONFIG_DEFAULTS.consecutiveFrames,
    };
  } catch {
    return CONFIG_DEFAULTS;
  }
}

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
  challengeType: ChallengeType,
  config: ChallengeConfig
): { passed: boolean; score: number } {
  switch (challengeType) {
    case "head-left": {
      const yaw = face.Pose?.Yaw ?? 0;
      return { passed: yaw >= config.headTurnAngle, score: Math.abs(yaw) };
    }
    case "head-right": {
      const yaw = face.Pose?.Yaw ?? 0;
      return { passed: yaw <= -config.headTurnAngle, score: Math.abs(yaw) };
    }
    case "head-up": {
      const pitch = face.Pose?.Pitch ?? 0;
      return { passed: pitch >= config.headTurnAngle, score: Math.abs(pitch) };
    }
    case "head-down": {
      const pitch = face.Pose?.Pitch ?? 0;
      return { passed: pitch <= -config.headTurnAngle, score: Math.abs(pitch) };
    }
    case "smile": {
      const confidence = face.Smile?.Confidence ?? 0;
      const value = face.Smile?.Value ?? false;
      return {
        passed: value || confidence >= config.smileThreshold,
        score: confidence,
      };
    }
    case "mouth-open": {
      const confidence = face.MouthOpen?.Confidence ?? 0;
      const value = face.MouthOpen?.Value ?? false;
      return {
        passed: value || confidence >= config.mouthOpenThreshold,
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
    const config = await getConfig();
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

      const { passed, score } = evaluateChallenge(face, type, config);

      if (passed) {
        consecutivePasses++;
        maxConsecutive = Math.max(maxConsecutive, consecutivePasses);
        bestScore = Math.max(bestScore, score);
      } else {
        consecutivePasses = 0;
      }
    }

    const challengePassed = maxConsecutive >= config.consecutiveFrames;

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
        requiredConsecutive: config.consecutiveFrames,
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
