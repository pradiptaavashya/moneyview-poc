import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SESSIONS_TABLE = process.env.SESSIONS_TABLE_NAME!;

export const handler = async (
  _event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const result = await ddb.send(
      new ScanCommand({ TableName: SESSIONS_TABLE })
    );
    const items = result.Items ?? [];

    const total = items.length;
    const passed = items.filter((i) => i.livenessResult === "passed").length;
    const failed = items.filter((i) => i.livenessResult === "failed").length;
    const pending = total - passed - failed;

    const challengesPassed = items.filter(
      (i) => Array.isArray(i.challenges) && i.challenges.every((c: { passed: boolean }) => c.passed)
    ).length;

    const faceMatches = items.filter((i) => i.faceMatchPassed === true).length;

    const now = Date.now();
    const day = 86400000;
    const last24h = items.filter(
      (i) => i.createdAt && now - new Date(i.createdAt).getTime() < day
    ).length;
    const last7d = items.filter(
      (i) => i.createdAt && now - new Date(i.createdAt).getTime() < day * 7
    ).length;

    const avgScore =
      items.reduce((sum, i) => sum + (i.livenessScore ?? 0), 0) /
      (total || 1);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total,
        passed,
        failed,
        pending,
        passRate: total ? ((passed / total) * 100).toFixed(1) : "0",
        challengesPassed,
        faceMatches,
        last24h,
        last7d,
        avgScore: avgScore.toFixed(1),
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
