import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  RekognitionClient,
  CompareFacesCommand,
} from "@aws-sdk/client-rekognition";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const rekognition = new RekognitionClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SESSIONS_TABLE = process.env.SESSIONS_TABLE_NAME!;
const VIDEO_BUCKET = process.env.VIDEO_S3_BUCKET!;
const REFERENCE_BUCKET = process.env.REFERENCE_DOC_S3_BUCKET!;
const CONFIG_TABLE = process.env.CONFIG_TABLE_NAME!;
const DEFAULT_MATCH_THRESHOLD = 90;

async function getFaceMatchThreshold(): Promise<number> {
  try {
    const result = await ddb.send(
      new GetCommand({ TableName: CONFIG_TABLE, Key: { pk: "config" } })
    );
    return result.Item?.faceMatchThreshold ?? DEFAULT_MATCH_THRESHOLD;
  } catch {
    return DEFAULT_MATCH_THRESHOLD;
  }
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const sessionId = event.pathParameters?.id;
    const body = JSON.parse(event.body ?? "{}");
    const { createdAt, referenceKey } = body;

    if (!sessionId || !referenceKey) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing sessionId or referenceKey" }),
      };
    }

    const matchThreshold = await getFaceMatchThreshold();

    // Source: liveness reference image (stored by Rekognition in video bucket)
    // Target: uploaded reference document (in reference docs bucket)
    const compareResult = await rekognition.send(
      new CompareFacesCommand({
        SourceImage: {
          S3Object: {
            Bucket: VIDEO_BUCKET,
            Name: `audit/${sessionId}/reference.jpg`,
          },
        },
        TargetImage: {
          S3Object: {
            Bucket: REFERENCE_BUCKET,
            Name: referenceKey,
          },
        },
        SimilarityThreshold: 70,
      })
    );

    const similarity =
      compareResult.FaceMatches?.[0]?.Similarity ?? 0;
    const passed = similarity >= matchThreshold;

    if (createdAt) {
      await ddb.send(
        new UpdateCommand({
          TableName: SESSIONS_TABLE,
          Key: { sessionId, createdAt },
          UpdateExpression:
            "SET faceMatchScore = :score, faceMatchResult = :result, #st = :status",
          ExpressionAttributeNames: { "#st": "status" },
          ExpressionAttributeValues: {
            ":score": similarity,
            ":result": passed ? "pass" : "fail",
            ":status": "complete",
          },
        })
      );
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        similarity,
        passed,
        threshold: matchThreshold,
        message: passed
          ? "Face matches reference document"
          : "Face does not match reference document",
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
