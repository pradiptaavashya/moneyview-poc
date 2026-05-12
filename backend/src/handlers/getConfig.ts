import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CONFIG_TABLE = process.env.CONFIG_TABLE_NAME!;

const DEFAULTS: Record<string, number | number[] | string[]> = {
  livenessThreshold: 90,
  headTurnAngle: 20,
  smileThreshold: 80,
  mouthOpenThreshold: 80,
  consecutiveFrames: 3,
  timeWindow: 8,
  challengeCount: 3,
  maxRetries: 3,
  faceMatchThreshold: 90,
  enabledChallenges: ["head-left", "head-right", "head-up", "head-down", "smile", "mouth-open"],
};

export const handler = async (
  _event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const result = await ddb.send(
      new GetCommand({ TableName: CONFIG_TABLE, Key: { pk: "config" } })
    );

    const config = { ...DEFAULTS, ...result.Item };
    delete (config as Record<string, unknown>).pk;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    };
  } catch {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(DEFAULTS),
    };
  }
};
