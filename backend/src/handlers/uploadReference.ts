import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  RekognitionClient,
  DetectFacesCommand,
} from "@aws-sdk/client-rekognition";

const s3 = new S3Client({});
const rekognition = new RekognitionClient({});

const REFERENCE_BUCKET = process.env.REFERENCE_DOC_S3_BUCKET!;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body ?? "{}");
    const { sessionId, image } = body;

    if (!sessionId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing sessionId" }),
      };
    }

    // If image is provided as base64, upload directly and detect face
    if (image) {
      const imageBytes = Buffer.from(image, "base64");
      const key = `${sessionId}/reference/document.jpg`;

      // Detect face in the uploaded document
      const detectResult = await rekognition.send(
        new DetectFacesCommand({
          Image: { Bytes: imageBytes },
          Attributes: ["DEFAULT"],
        })
      );

      if (!detectResult.FaceDetails?.length) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "No face detected in the document. Please upload a clearer photo.",
          }),
        };
      }

      await s3.send(
        new PutObjectCommand({
          Bucket: REFERENCE_BUCKET,
          Key: key,
          Body: imageBytes,
          ContentType: "image/jpeg",
        })
      );

      const faceBox = detectResult.FaceDetails[0].BoundingBox;

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          faceDetected: true,
          boundingBox: faceBox,
        }),
      };
    }

    // Otherwise return a presigned URL for direct upload
    const key = `${sessionId}/reference/document.jpg`;
    const command = new PutObjectCommand({
      Bucket: REFERENCE_BUCKET,
      Key: key,
      ContentType: "image/jpeg",
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadUrl, key }),
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
