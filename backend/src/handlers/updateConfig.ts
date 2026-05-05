import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CONFIG_TABLE = process.env.CONFIG_TABLE_NAME!;

const BOUNDS: Record<string, { min: number; max: number }> = {
  livenessThreshold: { min: 50, max: 99 },
  headTurnAngle: { min: 10, max: 45 },
  smileThreshold: { min: 50, max: 99 },
  mouthOpenThreshold: { min: 50, max: 99 },
  consecutiveFrames: { min: 1, max: 10 },
  timeWindow: { min: 3, max: 10 },
  challengeCount: { min: 1, max: 6 },
  maxRetries: { min: 1, max: 5 },
  faceMatchThreshold: { min: 70, max: 99 },
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body ?? "{}");
    const { updatedBy, ...params } = body;

    // Validate bounds
    for (const [key, value] of Object.entries(params)) {
      if (key === "enabledChallenges") continue;
      const bound = BOUNDS[key];
      if (bound && typeof value === "number") {
        if (value < bound.min || value > bound.max) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: `${key} must be between ${bound.min} and ${bound.max}`,
            }),
          };
        }
      }
    }

    // Get existing config for version history
    const existing = await ddb.send(
      new GetCommand({ TableName: CONFIG_TABLE, Key: { pk: "config" } })
    );
    const version = ((existing.Item?.version as number) ?? 0) + 1;

    await ddb.send(
      new PutCommand({
        TableName: CONFIG_TABLE,
        Item: {
          pk: "config",
          ...params,
          version,
          updatedAt: new Date().toISOString(),
          updatedBy: updatedBy ?? "unknown",
        },
      })
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, version }),
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
