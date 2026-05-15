import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";

const API_URL = import.meta.env.VITE_API_URL;

interface ReferenceUploadProps {
  sessionId: string;
  onUpload: (referenceKey: string) => void;
  onSkip: () => void;
}

export function ReferenceUpload({ sessionId, onUpload, onSkip }: ReferenceUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceBox, setFaceBox] = useState<{
    Width: number; Height: number; Left: number; Top: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setFaceBox(null);

      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);

      setUploading(true);
      try {
        const base64 = await fileToBase64(file);
        const res = await fetch(`${API_URL}/reference/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, image: base64 }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Upload failed");
          setPreview(null);
          return;
        }

        setFaceBox(data.boundingBox);
        onUpload(data.key);
      } catch {
        setError("Upload failed. Please try again.");
        setPreview(null);
      } finally {
        setUploading(false);
      }
    },
    [sessionId, onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith("image/")) handleFile(file);
    },
    [handleFile]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900 rounded-xl border border-gray-800 p-6"
    >
      <h2 className="text-lg font-semibold text-white mb-1">Upload ID Photo</h2>
      <p className="text-sm text-gray-400 mb-4">
        Upload a photo of your ID document for face comparison after the liveness check.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
          {error}
        </div>
      )}

      {!preview ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center"
        >
          <svg className="w-10 h-10 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-gray-400 mb-4">Upload a clear photo of your ID</p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              Take Photo
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium transition-colors"
            >
              Gallery
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-3">JPG, PNG, HEIC</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      ) : (
        <div className="relative rounded-lg overflow-hidden mb-4">
          <img src={preview} alt="ID Preview" className="w-full" />
          {faceBox && (
            <div
              className="absolute border-2 border-green-400 rounded"
              style={{
                left: `${faceBox.Left * 100}%`,
                top: `${faceBox.Top * 100}%`,
                width: `${faceBox.Width * 100}%`,
                height: `${faceBox.Height * 100}%`,
              }}
            />
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
            </div>
          )}
        </div>
      )}

      <button
        onClick={onSkip}
        className="w-full mt-3 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        Skip (compare later)
      </button>
    </motion.div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX_DIM = 1024;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      resolve(dataUrl.split(",")[1]);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
