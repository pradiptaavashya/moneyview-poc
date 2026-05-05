import { useRef, useCallback, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

export function useVideoRecorder(sessionId: string | null) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 720, height: 960 },
      });
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9",
      });
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
        const blob = new Blob(chunksRef.current, { type: "video/webm" });

        if (sessionId && blob.size > 0) {
          try {
            const res = await fetch(
              `${API_URL}/sessions/${sessionId}/video-url`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              }
            );
            const { uploadUrl } = await res.json();
            if (uploadUrl) {
              await fetch(uploadUrl, {
                method: "PUT",
                body: blob,
                headers: { "Content-Type": "video/webm" },
              });
            }
          } catch {
            // Upload failure is non-blocking
          }
        }

        // Stop all tracks
        recorder.stream.getTracks().forEach((t) => t.stop());
        resolve();
      };
      recorder.stop();
    });
  }, [sessionId]);

  return { start, stop, recording };
}
