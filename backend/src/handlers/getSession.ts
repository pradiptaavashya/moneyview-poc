import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  RekognitionClient,
  GetFaceLivenessSessionResultsCommand,
} from "@aws-sdk/client-rekognition";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const rekognition = new RekognitionClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SESSIONS_TABLE = process.env.SESSIONS_TABLE_NAME!;
const CONFIG_TABLE = process.env.CONFIG_TABLE_NAME!;
const DEFAULT_THRESHOLD = 90;

async function getThreshold(): Promise<number> {
  try {
    const result = await ddb.send(
      new QueryCommand({
        TableName: CONFIG_TABLE,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": "config" },
      })
    );
    const item = result.Items?.[0];
    if (item?.livenessThreshold) return item.livenessThreshold as number;
  } catch {
    // fall through to env/default
  }
  return Number(process.env.LIVENESS_THRESHOLD) || DEFAULT_THRESHOLD;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const sessionId = event.pathParameters?.id;
    if (!sessionId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing session ID" }),
      };
    }

    const { Confidence, Status, AuditImages, ReferenceImage } =
      await rekognition.send(
        new GetFaceLivenessSessionResultsCommand({ SessionId: sessionId })
      );

    const threshold = await getThreshold();
    const score = Confidence ?? 0;
    const passed = score >= threshold && Status === "SUCCEEDED";

    const now = new Date().toISOString();

    await ddb.send(
      new UpdateCommand({
        TableName: SESSIONS_TABLE,
        Key: { sessionId, createdAt: now },
        UpdateExpression:
          "SET livenessScore = :score, livenessResult = :result, #st = :status, auditImageCount = :aic, referenceImageKey = :ref",
        ExpressionAttributeNames: { "#st": "status" },
        ExpressionAttributeValues: {
          ":score": score,
          ":result": passed ? "pass" : "fail",
          ":status": "liveness_complete",
          ":aic": AuditImages?.length ?? 0,
          ":ref": ReferenceImage?.S3Object?.Name ?? null,
        },
      })
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        score,
        passed,
        threshold,
        status: Status,
        auditImageCount: AuditImages?.length ?? 0,
        referenceImage: ReferenceImage?.S3Object?.Name ?? null,
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
