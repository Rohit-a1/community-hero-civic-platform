import React, { useRef, useState, useEffect } from "react";
import { Camera, RefreshCw, AlertCircle, Check, MapPin, Video, Square } from "lucide-react";
import { GPSLocation } from "../types";

interface CameraCaptureProps {
  onCapture: (photoBase64: string, gps: GPSLocation, videoBlob?: Blob | null) => void;
  onCancel: () => void;
}

const extractFirstFrame = (blob: Blob): Promise<string> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.autoplay = false;
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(blob);
    video.src = url;
    
    // Set a timeout fallback
    const timeout = setTimeout(() => {
      resolve("");
    }, 2000);

    video.onloadeddata = () => {
      video.currentTime = 0.1;
    };
    video.onseeked = () => {
      clearTimeout(timeout);
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        resolve(dataUrl);
      } else {
        resolve("");
      }
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      clearTimeout(timeout);
      resolve("");
      URL.revokeObjectURL(url);
    };
  });
};

export default function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [gps, setGps] = useState<GPSLocation | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);

  // Video recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [capturedVideoBlob, setCapturedVideoBlob] = useState<Blob | null>(null);
  const [capturedVideoUrl, setCapturedVideoUrl] = useState<string | null>(null);

  const pressTimerRef = useRef<any>(null);
  const isLongPressRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<any>(null);

  // Initialize camera stream
  useEffect(() => {
    startCamera();
    captureGpsLocation();

    return () => {
      stopCamera();
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (capturedVideoUrl) {
        URL.revokeObjectURL(capturedVideoUrl);
      }
    };
  }, [facingMode]);

  const startCamera = async () => {
    setIsInitializing(true);
    setError(null);
    stopCamera();

    try {
      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsInitializing(false);
    } catch (err: any) {
      console.error("Camera access error:", err);
      setError(
        "Could not access camera. Please make sure you have given camera permissions in your browser."
      );
      setIsInitializing(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const captureGpsLocation = () => {
    setIsCapturingGps(true);
    setGpsError(null);
    // Immediately set default fallback coordinates so we always have a valid location
    setGps({ latitude: 37.7749, longitude: -122.4194 });

    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser.");
      setIsCapturingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGps({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setIsCapturingGps(false);
      },
      (error) => {
        console.warn("GPS error with high accuracy, trying low accuracy...", error);
        // Fallback to low accuracy
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setGps({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
            setIsCapturingGps(false);
          },
          (err2) => {
            console.error("GPS error with low accuracy:", err2);
            setGpsError("Could not retrieve GPS location. Using default location.");
            setIsCapturingGps(false);
          },
          { enableHighAccuracy: false, timeout: 5000 }
        );
      },
      { enableHighAccuracy: true, timeout: 4000 }
    );
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const takePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Draw mirror image if using front camera
      if (facingMode === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      setCapturedPhoto(dataUrl);
      // Immediately stop the camera stream once photo is taken
      stopCamera();
    }
  };

  const startVideoRecording = async () => {
    if (!streamRef.current) return;
    
    try {
      setIsRecording(true);
      setRecordingSeconds(0);
      recordedChunksRef.current = [];

      let options = { mimeType: "video/webm;codecs=vp9" };
      if (typeof MediaRecorder !== "undefined") {
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: "video/webm;codecs=vp8" };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: "video/webm" };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: "video/mp4" };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: "" };
        }
      }

      const recorder = new MediaRecorder(streamRef.current, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || "video/webm";
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        setCapturedVideoBlob(blob);
        
        const videoUrl = URL.createObjectURL(blob);
        setCapturedVideoUrl(videoUrl);

        // Extract first frame
        const firstFrame = await extractFirstFrame(blob);
        setCapturedPhoto(firstFrame);
        stopCamera();
      };

      recorder.start(100);

      let elapsed = 0;
      recordingIntervalRef.current = setInterval(() => {
        elapsed += 1;
        setRecordingSeconds(elapsed);
        if (elapsed >= 30) {
          stopVideoRecording();
        }
      }, 1000);

    } catch (err) {
      console.error("Failed to start video recording:", err);
      setIsRecording(false);
    }
  };

  const stopVideoRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    
    setIsRecording(false);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (isInitializing || !!error) return;

    isLongPressRef.current = false;
    
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
    }

    pressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      startVideoRecording();
    }, 300);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    cleanupPress();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    cleanupPress();
  };

  const cleanupPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }

    if (isLongPressRef.current) {
      stopVideoRecording();
    } else {
      takePhoto();
    }
    isLongPressRef.current = false;
  };

  const handleConfirm = () => {
    if (gps) {
      onCapture(capturedPhoto || "", gps, capturedVideoBlob);
    }
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
    setCapturedVideoBlob(null);
    if (capturedVideoUrl) {
      URL.revokeObjectURL(capturedVideoUrl);
    }
    setCapturedVideoUrl(null);
    startCamera();
    captureGpsLocation();
  };

  return (
    <div id="camera_capture_modal" className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-between p-4 sm:p-6 md:p-8">
      {/* Header */}
      <div id="camera_header" className="w-full max-w-lg flex items-center justify-between text-white z-10">
        <h3 className="font-sans text-lg font-medium tracking-tight">
          {capturedVideoUrl ? "Review Civic Video" : capturedPhoto ? "Review Civic Photo" : "Capture Civic Issue"}
        </h3>
        {!capturedPhoto && !error && !isInitializing && (
          <button
            id="btn_toggle_camera"
            onClick={toggleCamera}
            disabled={isRecording}
            className="p-2 rounded-full bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Switch Camera"
          >
            <RefreshCw className="h-5 w-5 text-gray-300" />
          </button>
        )}
      </div>

      {/* Main Viewport */}
      <div id="camera_viewport_container" className="relative w-full max-w-lg flex-1 flex items-center justify-center my-4 overflow-hidden rounded-2xl bg-neutral-950 border border-neutral-800">
        {/* Red pulsing border overlay when recording */}
        {isRecording && (
          <div className="absolute inset-0 border-4 border-red-500 animate-pulse rounded-2xl pointer-events-none z-20" />
        )}

        {/* Recording Timer Overlay */}
        {isRecording && (
          <div id="recording_timer_badge" className="absolute top-4 right-4 bg-red-600/90 text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-bold font-mono animate-pulse z-30 shadow-lg border border-red-500/30">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            <span>
              0:{recordingSeconds < 10 ? `0${recordingSeconds}` : recordingSeconds}
            </span>
          </div>
        )}

        {capturedVideoUrl ? (
          <video
            id="captured_video_preview"
            src={capturedVideoUrl}
            controls
            playsInline
            autoPlay
            className="w-full h-full object-cover"
          />
        ) : capturedPhoto ? (
          <img
            id="captured_photo_preview"
            src={capturedPhoto}
            alt="Captured issue preview"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : error ? (
          <div id="camera_error_state" className="flex flex-col items-center justify-center p-6 text-center text-red-400">
            <AlertCircle className="h-12 w-12 mb-3" />
            <p className="text-sm font-medium">{error}</p>
            <button
              id="btn_retry_camera"
              onClick={startCamera}
              className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-sm font-medium transition"
            >
              Retry Camera Access
            </button>
          </div>
        ) : (
          <>
            {isInitializing && (
              <div id="camera_loading_state" className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950 text-gray-400">
                <RefreshCw className="h-8 w-8 animate-spin mb-2" />
                <p className="text-xs">Initializing Camera...</p>
              </div>
            )}
            <video
              id="camera_video_stream"
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </>
        )}

        {/* GPS Badge overlays */}
        {gps && (
          <div id="gps_overlay_badge" className="absolute bottom-4 left-4 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-white/10 shadow-lg text-[11px] text-gray-300 font-mono">
            <MapPin className="h-3 w-3 text-emerald-400" />
            <span>
              {gps.latitude.toFixed(5)}, {gps.longitude.toFixed(5)}
            </span>
            {isCapturingGps && <span className="animate-pulse text-neutral-400">(Updating...)</span>}
          </div>
        )}
      </div>

      {/* Controls */}
      <div id="camera_controls_panel" className="w-full max-w-lg flex flex-col gap-4 z-10">
        {capturedPhoto ? (
          <div id="review_actions" className="grid grid-cols-2 gap-4 w-full">
            <button
              id="btn_retake_photo"
              onClick={handleRetake}
              className="py-3.5 px-6 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-sm transition text-center border border-neutral-800"
            >
              {capturedVideoUrl ? "Retake Video" : "Retake Photo"}
            </button>
            <button
              id="btn_confirm_photo"
              onClick={handleConfirm}
              disabled={!gps}
              className="py-3.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition text-center flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              <Check className="h-4 w-4" />
              {capturedVideoUrl ? "Use This Video" : "Use This Photo"}
            </button>
          </div>
        ) : (
          <div id="capture_actions" className="flex items-center justify-between px-6 w-full">
            <button
              id="btn_cancel_camera"
              onClick={onCancel}
              disabled={isRecording}
              className="text-neutral-400 hover:text-white font-medium text-sm transition disabled:opacity-35"
            >
              Cancel
            </button>

            {/* Shutter wrapper */}
            <div className="relative w-24 h-24 flex items-center justify-center">
              {/* Snapchat-style growing progress ring */}
              {isRecording && (
                <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none z-10" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke="rgba(255, 255, 255, 0.2)"
                    strokeWidth="4"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke="#ef4444" // red-500
                    strokeWidth="4"
                    fill="transparent"
                    strokeDasharray="264"
                    strokeDashoffset={264 - (recordingSeconds / 30) * 264}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 1s linear" }}
                  />
                </svg>
              )}

              <button
                id="btn_take_snapshot"
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                disabled={isInitializing || !!error}
                className={`p-5 rounded-full transition-all flex items-center justify-center border-4 disabled:opacity-50 disabled:scale-100 ${
                  isRecording 
                    ? "bg-red-600 border-red-400 scale-110 text-white" 
                    : "bg-white border-neutral-300 hover:scale-105 active:scale-95 text-neutral-900"
                }`}
                title="Tap for Photo, Hold for Video"
                style={{ touchAction: "none" }}
              >
                {isRecording ? (
                  <Square className="h-8 w-8 text-white fill-white" />
                ) : (
                  <Camera className="h-8 w-8 text-neutral-900" />
                )}
              </button>
            </div>

            <div className="w-12 text-center text-[10px] text-gray-500 font-sans pointer-events-none">
              {!isRecording && "Tap / Hold"}
            </div>
          </div>
        )}

        {gpsError && !capturedPhoto && (
          <div id="gps_warning" className="text-center text-xs text-amber-400 flex items-center justify-center gap-1.5 px-4">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{gpsError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
