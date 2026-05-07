import { useState, useEffect, useRef } from "react";

type Step = "photo" | "document" | "verification";

interface UserDetail {
  name: string;
  dob: string;
  pan: string;
  mobile: string;
}

interface ChatMessage {
  from: "agent" | "client";
  text: string;
}

export function DemoPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState<Step>("photo");
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [cardDetected, setCardDetected] = useState(false);
  const [cardCaptured, setCardCaptured] = useState(false);
  const [cardThumb, setCardThumb] = useState<string | null>(null);
  const [recording] = useState(true);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { from: "agent", text: "Please show your face clearly to the camera" },
  ]);
  const [chatInput, setChatInput] = useState("");

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 1280, height: 720 },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        // Camera error
      }
    }
    startCamera();
    return () => {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Simulate face detection after camera starts
  useEffect(() => {
    const timer = setTimeout(() => {
      setFaceDetected(true);
      setMessages((m) => [...m, { from: "agent", text: "Face detected. Hold still..." }]);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // After face detected, capture frame and verify
  useEffect(() => {
    if (!faceDetected || faceVerified) return;
    const timer = setTimeout(async () => {
      // Capture a frame for face verification
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0);
        }
      }
      setFaceVerified(true);
      setStep("document");
      setMessages((m) => [
        ...m,
        { from: "agent", text: "Face verified! Now please show your Aadhaar/PAN card" },
      ]);
    }, 2500);
    return () => clearTimeout(timer);
  }, [faceDetected, faceVerified]);

  // After step moves to document, simulate card detection
  useEffect(() => {
    if (step !== "document") return;
    const timer = setTimeout(() => {
      setCardDetected(true);
      setMessages((m) => [...m, { from: "client", text: "Sure, here's my card" }]);
      setTimeout(() => {
        // Capture card thumbnail
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0);
            setCardThumb(canvas.toDataURL("image/jpeg", 0.6));
          }
        }
        setCardCaptured(true);
        setUserDetail({
          name: "Deepu K.",
          dob: "15/08/1990",
          pan: "ABCPD1234F",
          mobile: "+91 98765 43210",
        });
        setStep("verification");
        setMessages((m) => [
          ...m,
          { from: "agent", text: "Card captured. Verifying details..." },
          { from: "agent", text: "Verification complete! All checks passed." },
        ]);
      }, 2000);
    }, 3000);
    return () => clearTimeout(timer);
  }, [step]);

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    setMessages((m) => [...m, { from: "client", text: chatInput }]);
    setChatInput("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-gray-950 to-gray-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <StepIndicator label="Photo Upload" active={step === "photo"} done={step !== "photo"} />
          <DashedLine done={step === "document" || step === "verification"} />
          <StepIndicator label="Document Upload" active={step === "document"} done={step === "verification"} />
          <DashedLine done={step === "verification"} />
          <StepIndicator label="Verification" active={step === "verification"} done={false} />
          <div className="ml-auto hidden md:block">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-green-500 text-green-400 text-xs font-medium">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Secure connection
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* Main video area */}
          <div className="relative bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
            <video
              ref={videoRef}
              className="w-full aspect-video object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Face detection overlay */}
            {faceDetected && (
              <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-[200px] h-[250px] md:w-[240px] md:h-[300px]">
                {/* Corner brackets */}
                <div className="absolute top-0 left-0 w-8 h-8 border-l-2 border-t-2 border-white" />
                <div className="absolute top-0 right-0 w-8 h-8 border-r-2 border-t-2 border-white" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-l-2 border-b-2 border-white" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-r-2 border-b-2 border-white" />
              </div>
            )}

            {/* Status indicators */}
            <div className="absolute top-[20%] right-4 md:right-8 space-y-1">
              {faceDetected && (
                <p className="text-green-400 text-sm font-medium">Face detected</p>
              )}
              {faceVerified && (
                <p className="text-green-400 text-sm font-medium">Face verified</p>
              )}
            </div>

            {/* Card detection status */}
            {step === "document" && (
              <div className="absolute bottom-20 left-4 space-y-1">
                {cardDetected && (
                  <p className="text-green-400 text-sm font-medium">Card detected</p>
                )}
                {cardCaptured ? (
                  <p className="text-green-400 text-sm font-medium">Card captured</p>
                ) : cardDetected ? (
                  <p className="text-green-400 text-sm font-medium animate-pulse">Capturing...</p>
                ) : null}
              </div>
            )}

            {/* Card thumbnail */}
            {cardThumb && (
              <div className="absolute bottom-4 left-4 w-32 h-20 md:w-40 md:h-24 rounded-lg border-2 border-green-500 overflow-hidden shadow-lg">
                <img src={cardThumb} alt="Card" className="w-full h-full object-cover" />
              </div>
            )}

            {/* Bottom toolbar */}
            <div className="absolute bottom-0 inset-x-0 bg-gray-900/90 backdrop-blur-sm border-t border-gray-800 px-4 py-3 flex items-center justify-center gap-3">
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-xs border border-gray-700">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Screen Capture
              </button>
              <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${recording ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300"}`}>
                <div className={`w-2 h-2 rounded-full ${recording ? "bg-white animate-pulse" : "bg-red-500"}`} />
                REC
              </button>
              <ToolbarButton icon="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
              <ToolbarButton icon="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
              <ToolbarButton icon="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              <ToolbarButton icon="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              <button className="p-2 rounded-full bg-red-600 text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            {/* User Details */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <h3 className="text-white font-semibold mb-3">User Detail</h3>
              {userDetail ? (
                <div className="space-y-2 text-sm">
                  <DetailRow label="Name" value={userDetail.name} />
                  <DetailRow label="DOB" value={userDetail.dob} />
                  <DetailRow label="PAN Number" value={userDetail.pan} />
                  <DetailRow label="Mobile" value={userDetail.mobile} />
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">Waiting for document scan...</p>
              )}
            </div>

            {/* Chat */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex flex-col" style={{ maxHeight: "360px" }}>
              <h3 className="text-white font-semibold mb-3">Chats</h3>
              <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[120px]">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.from === "client" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.from === "agent"
                        ? "bg-gray-800 text-gray-200"
                        : "bg-indigo-600 text-white"
                    }`}>
                      <p className="text-[10px] text-gray-400 mb-0.5 capitalize">{msg.from}</p>
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Write a message"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500"
                />
                <button onClick={sendMessage} className="px-3 py-2 bg-indigo-600 rounded-lg text-white text-sm">
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
        done ? "bg-green-500 text-white" : active ? "bg-indigo-500 text-white" : "bg-gray-700 text-gray-400"
      }`}>
        {done ? (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <div className="w-2 h-2 rounded-full bg-current" />
        )}
      </div>
      <span className={`text-xs font-medium hidden sm:inline ${done ? "text-green-400" : active ? "text-white" : "text-gray-500"}`}>
        {label}
      </span>
    </div>
  );
}

function DashedLine({ done }: { done: boolean }) {
  return (
    <div className={`w-12 md:w-20 border-t-2 border-dashed ${done ? "border-green-500" : "border-gray-600"}`} />
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400 font-medium">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function ToolbarButton({ icon }: { icon: string }) {
  return (
    <button className="p-2 rounded-full bg-gray-800 text-gray-400 hover:text-white border border-gray-700">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
      </svg>
    </button>
  );
}
