import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SESSIONS_TABLE = process.env.SESSIONS_TABLE_NAME!;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const params = event.queryStringParameters ?? {};
    const userId = params.userId;
    const limit = Math.min(Number(params.limit) || 50, 100);

    let items;
    if (userId) {
      const result = await ddb.send(
        new QueryCommand({
          TableName: SESSIONS_TABLE,
          IndexName: "userId-index",
          KeyConditionExpression: "userId = :uid",
          ExpressionAttributeValues: { ":uid": userId },
          Limit: limit,
          ScanIndexForward: false,
        })
      );
      items = result.Items ?? [];
    } else {
      const result = await ddb.send(
        new ScanCommand({
          TableName: SESSIONS_TABLE,
          Limit: limit,
        })
      );
      items = result.Items ?? [];
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: items, count: items.length }),
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
