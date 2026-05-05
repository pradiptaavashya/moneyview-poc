import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SESSIONS_TABLE = process.env.SESSIONS_TABLE_NAME!;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const params = event.queryStringParameters ?? {};
    const format = params.format ?? "json";

    const result = await ddb.send(
      new ScanCommand({ TableName: SESSIONS_TABLE })
    );
    const items = result.Items ?? [];

    if (format === "csv") {
      const headers = [
        "sessionId",
        "userId",
        "createdAt",
        "livenessResult",
        "livenessScore",
        "faceMatchPassed",
        "faceMatchScore",
      ];
      const rows = items.map((item) =>
        headers.map((h) => String(item[h] ?? "")).join(",")
      );
      const csv = [headers.join(","), ...rows].join("\n");

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=sessions.csv",
        },
        body: csv,
      };
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
