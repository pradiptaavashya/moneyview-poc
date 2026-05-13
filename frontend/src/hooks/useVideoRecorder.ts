import { useRef, useCallback, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

export function useVideoRecorder(sessionId: string | null) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 720, height: 960 },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : MediaRecorder.isTypeSupported("video/mp4")
            ? "video/mp4"
            : "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(1000); // 1-second chunks
      mediaRecorderRef.current = recorder;
      setRecording(true);
      return stream;
    } catch {
      return null;
    }
  }, []);

  const stop = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        setRecording(false);
        const actualType = recorder.mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: actualType });

        if (sessionId && blob.size > 0) {
          try {
            const res = await fetch(
              `${API_URL}/sessions/${sessionId}/video-url`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contentType: actualType }),
              }
            );
            const { uploadUrl } = await res.json();
            if (uploadUrl) {
              await fetch(uploadUrl, {
                method: "PUT",
                body: blob,
                headers: { "Content-Type": actualType },
              });
            }
          } catch {
            // Upload failure is non-blocking
          }
        }

        // Stop all tracks
        recorder.stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        resolve();
      };
      recorder.stop();
    });
  }, [sessionId]);

  const getStream = useCallback(() => streamRef.current, []);

  return { start, stop, recording, getStream };
}
