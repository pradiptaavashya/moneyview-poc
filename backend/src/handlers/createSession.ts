import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  RekognitionClient,
  CreateFaceLivenessSessionCommand,
} from "@aws-sdk/client-rekognition";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const rekognition = new RekognitionClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SESSIONS_TABLE = process.env.SESSIONS_TABLE_NAME!;
const VIDEO_BUCKET = process.env.VIDEO_S3_BUCKET!;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const userId = body.userId ?? "anonymous";

    const createResult = await rekognition.send(
      new CreateFaceLivenessSessionCommand({
        Settings: {
          AuditImagesLimit: 4,
          OutputConfig: {
            S3Bucket: VIDEO_BUCKET,
            S3KeyPrefix: "audit",
          },
        },
      })
    );
    const SessionId = createResult.SessionId;

    const now = new Date().toISOString();
    const dateKey = now.split("T")[0];

    await ddb.send(
      new PutCommand({
        TableName: SESSIONS_TABLE,
        Item: {
          sessionId: SessionId,
          createdAt: now,
          userId,
          dateKey,
          status: "created",
          livenessScore: null,
          livenessResult: null,
        },
      })
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: SessionId, createdAt: now }),
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
