import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface VideoVerificationProps {
  onComplete: (videos: { video1: File; video2: File }) => void;
  onClose: () => void;
}

type VerificationStep = 'initial' | 'error' | 'retry' | 'complete';

const VideoVerification: React.FC<VideoVerificationProps> = ({ onComplete, onClose }) => {
  const webcamRef = useRef<Webcam>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  // Component state
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isWebcamReady, setIsWebcamReady] = useState(false);
  const [currentStep, setCurrentStep] = useState<VerificationStep>('initial');
  const [firstVideo, setFirstVideo] = useState<File | null>(null);
  const [deviceCapabilities, setDeviceCapabilities] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Recording configuration
  const RECORDING_DURATION = 7000;
  const CIRCLE_SIZE = 400;
  const STROKE_WIDTH = 4;

  // Cross-platform video constraints with fallbacks
  const getVideoConstraints = useCallback(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (isIOS) {
      // iOS Safari specific constraints
      return {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        facingMode: 'user',
        frameRate: { ideal: 30, max: 30 }
      };
    } else if (isMobile) {
      // Android specific constraints
      return {
        width: { ideal: 1920, max: 3840 },
        height: { ideal: 1080, max: 2160 },
        facingMode: 'user',
        frameRate: { ideal: 30, max: 60 }
      };
    } else {
      // Desktop constraints
      return {
        width: { ideal: 1920, max: 3840 },
        height: { ideal: 1080, max: 2160 },
        facingMode: 'user',
        frameRate: { ideal: 30, max: 60 }
      };
    }
  }, []);

  // Get best supported MIME type for recording
  const getBestMimeType = useCallback(() => {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus', 
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4;codecs=h264,aac',
      'video/mp4'
    ];
    
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log('🎥 Selected MIME type:', type);
        return type;
      }
    }
    
    console.warn('⚠️ No preferred MIME type supported, using default');
    return '';
  }, []);

  // Detect device capabilities
  useEffect(() => {
    const detectCapabilities = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: getVideoConstraints(),
          audio: true 
        });
        
        const videoTrack = stream.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities();
        
        setDeviceCapabilities({
          maxWidth: capabilities.width?.max || 1920,
          maxHeight: capabilities.height?.max || 1080,
          maxFrameRate: capabilities.frameRate?.max || 30,
          facingModes: capabilities.facingMode || ['user']
        });
        
        console.log('📱 Device capabilities:', capabilities);
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.error('❌ Failed to detect capabilities:', error);
      }
    };
    
    detectCapabilities();
  }, [getVideoConstraints]);

  // Progress animation
  useEffect(() => {
    let animationFrame: number;
    
    if (isRecording) {
      const startTime = Date.now();
      
      const updateProgress = () => {
        const elapsed = Date.now() - startTime;
        const newProgress = Math.min((elapsed / RECORDING_DURATION) * 100, 100);
        setProgress(newProgress);
        
        if (elapsed >= RECORDING_DURATION) {
          stopRecording();
        } else {
          animationFrame = requestAnimationFrame(updateProgress);
        }
      };
      
      animationFrame = requestAnimationFrame(updateProgress);
    }
    
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    if (isRecording || !webcamRef.current?.video) return;
    
    try {
      setIsRecording(true);
      chunksRef.current = [];
      
      const stream = webcamRef.current.video.srcObject as MediaStream;
      if (!stream) throw new Error('No video stream available');
      
      const mimeType = getBestMimeType();
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      // Create MediaRecorder with device-appropriate settings
      const options: MediaRecorderOptions = {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: isMobile ? 2000000 : 5000000, // 2Mbps mobile, 5Mbps desktop
        audioBitsPerSecond: 128000 // 128kbps audio
      };
      
      // Remove undefined values
      Object.keys(options).forEach(key => {
        if (options[key as keyof MediaRecorderOptions] === undefined) {
          delete options[key as keyof MediaRecorderOptions];
        }
      });
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log('📊 Chunk received:', event.data.size, 'bytes');
        }
      };
      
      mediaRecorder.onstop = () => {
        handleRecordingStop();
      };
      
      mediaRecorder.onerror = (event) => {
        console.error('❌ MediaRecorder error:', event);
        setIsRecording(false);
        toast.error('Recording failed. Please try again.');
      };
      
      // Start recording with small time slices for reliability
      mediaRecorder.start(100);
      setProgress(0);
      
      console.log('🎬 Recording started with options:', options);
      toast.success(currentStep === 'initial' ? 'Recording started' : 'Recording second video...');
      
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      setIsRecording(false);
      toast.error('Failed to start recording. Please check camera permissions.');
    }
  }, [isRecording, currentStep, getBestMimeType]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const handleRecordingStop = useCallback(async () => {
    if (chunksRef.current.length === 0) {
      toast.error('No video data recorded. Please try again.');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      const mimeType = getBestMimeType();
      const videoBlob = new Blob(chunksRef.current, { 
        type: mimeType || 'video/webm' 
      });
      
      if (videoBlob.size === 0) {
        throw new Error('Video blob is empty');
      }
      
      console.log('🎬 Video blob created:', {
        size: videoBlob.size,
        type: videoBlob.type,
        chunks: chunksRef.current.length
      });
      
      // Validate video before proceeding
      const isValid = await validateVideo(videoBlob);
      if (!isValid) {
        throw new Error('Video validation failed');
      }
      
      // Create proper File object
      const timestamp = Date.now();
      const videoNumber = currentStep === 'initial' ? '1' : '2';
      const fileName = `verification_${videoNumber}_${timestamp}.webm`;
      
      const videoFile = new File([videoBlob], fileName, {
        type: videoBlob.type,
        lastModified: timestamp
      });
      
      console.log('✅ Video file created:', {
        name: videoFile.name,
        size: videoFile.size,
        type: videoFile.type
      });
      
      if (currentStep === 'initial') {
        setFirstVideo(videoFile);
        setCurrentStep('error');
      } else if (currentStep === 'retry' && firstVideo) {
        onComplete({ video1: firstVideo, video2: videoFile });
      }
      
    } catch (error) {
      console.error('❌ Video processing failed:', error);
      toast.error('Video processing failed. Please try again.');
    } finally {
      setIsProcessing(false);
      setProgress(100);
    }
  }, [currentStep, firstVideo, onComplete, getBestMimeType]);

  // Validate video blob by attempting to load it
  const validateVideo = useCallback((blob: Blob): Promise<boolean> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(blob);
      
      const cleanup = () => {
        URL.revokeObjectURL(url);
        video.remove();
      };
      
      const timeout = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 5000);
      
      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        const isValid = video.duration > 0 && video.videoWidth > 0 && video.videoHeight > 0;
        console.log('✅ Video validation:', {
          valid: isValid,
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight
        });
        cleanup();
        resolve(isValid);
      };
      
      video.onerror = () => {
        clearTimeout(timeout);
        console.error('❌ Video validation failed');
        cleanup();
        resolve(false);
      };
      
      video.src = url;
      video.load();
    });
  }, []);

  const handleWebcamReady = useCallback(() => {
    setIsWebcamReady(true);
    const video = webcamRef.current?.video;
    if (video) {
      console.log('📹 Webcam ready:', {
        width: video.videoWidth,
        height: video.videoHeight
      });
    }
  }, []);

  const radius = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  
  const getProgressStyle = (progress: number) => {
    const dashOffset = circumference * (1 - progress / 100);
    return {
      strokeDasharray: `${circumference} ${circumference}`,
      strokeDashoffset: dashOffset,
    };
  };

  const headTurnAnimation = {
    initial: { scaleX: 1 },
    animate: {
      scaleX: [1, 1, -1, -1, 1],
      transition: {
        duration: 0.7,
        times: [0, 0.285, 0.285, 0.715, 0.715],
        repeat: Infinity,
        repeatDelay: 0.2,
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-gray-900"
    >
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gray-900/50 backdrop-blur-sm">
          <button
            onClick={onClose}
            className="text-white hover:text-red-500 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="text-white text-sm">
            {deviceCapabilities && (
              <span>Max: {deviceCapabilities.maxWidth}×{deviceCapabilities.maxHeight}</span>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {currentStep === 'error' ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex items-center justify-center p-4 bg-gray-900"
            >
              <div className="bg-white rounded-2xl p-8 max-w-xl w-full shadow-lg">
                <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-gray-900 mb-4 text-center">
                  Error verifying your identity
                </h3>
                <p className="text-gray-600 mb-8 text-center">
                  Please follow the head turn motion shown below
                </p>
                <div className="rounded-lg overflow-hidden mb-8 max-w-md mx-auto">
                  <motion.div 
                    className="relative aspect-square w-full"
                    variants={headTurnAnimation}
                    initial="initial"
                    animate="animate"
                  >
                    <img
                      src="https://i.ibb.co/wFNv1sxz/verif-Tuto.webp"
                      alt="Head turn demonstration"
                      className="w-full h-full object-contain"
                    />
                  </motion.div>
                </div>
                <button
                  onClick={() => setCurrentStep('retry')}
                  className="bg-red-600 text-white px-8 py-3 rounded-xl hover:bg-red-700 
                           transition-colors flex items-center justify-center mx-auto"
                >
                  <Camera className="w-5 h-5 mr-2" />
                  Start Again
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="relative flex flex-col items-center">
              <motion.div
                key="camera"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="relative"
                style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }}
              >
                <div className="absolute inset-0 overflow-hidden rounded-full">
                  <Webcam
                    ref={webcamRef}
                    audio={true}
                    videoConstraints={getVideoConstraints()}
                    className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full object-cover"
                    onUserMedia={handleWebcamReady}
                    onUserMediaError={(error) => {
                      console.error('❌ Webcam error:', error);
                      toast.error('Camera access denied. Please allow camera access and try again.');
                    }}
                  />
                </div>

                {/* Recording progress circle */}
                <svg
                  className="absolute inset-0"
                  width={CIRCLE_SIZE}
                  height={CIRCLE_SIZE}
                  style={{ transform: 'rotate(-90deg)' }}
                >
                  <circle
                    cx={CIRCLE_SIZE / 2}
                    cy={CIRCLE_SIZE / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.2)"
                    strokeWidth={STROKE_WIDTH}
                  />
                  <motion.circle
                    cx={CIRCLE_SIZE / 2}
                    cy={CIRCLE_SIZE / 2}
                    r={radius}
                    fill="none"
                    stroke="#E41705"
                    strokeWidth={STROKE_WIDTH}
                    strokeLinecap="round"
                    initial={getProgressStyle(0)}
                    animate={getProgressStyle(progress)}
                    transition={{ duration: 0.1 }}
                  />
                </svg>

                {/* Recording indicator */}
                {isRecording && (
                  <div className="absolute top-4 right-4 flex items-center space-x-2 bg-red-600 px-3 py-1 rounded-full">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    <span className="text-white text-sm">
                      {Math.ceil((100 - progress) * RECORDING_DURATION / 100000)}s
                    </span>
                  </div>
                )}

                {/* Processing indicator */}
                {isProcessing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full">
                    <div className="text-center text-white">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                      <span className="text-sm">Processing...</span>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Controls */}
        {currentStep !== 'error' && (
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="max-w-md mx-auto">
              <p className="text-white text-center mb-6">
                {currentStep === 'retry'
                  ? "Please slowly turn your head left and right"
                  : !isWebcamReady
                  ? "Initializing camera..."
                  : isRecording
                  ? "Recording in progress... Please stay still"
                  : "When you are ready, click the button to start"}
              </p>
              
              {!isRecording && !isProcessing && (
                <motion.button
                  onClick={startRecording}
                  disabled={!isWebcamReady}
                  className="w-full py-4 bg-red-600 text-white rounded-xl hover:bg-red-700 
                           disabled:bg-gray-600 disabled:cursor-not-allowed
                           flex items-center justify-center space-x-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Camera className="w-5 h-5" />
                  <span>Start {currentStep === 'retry' ? 'Second Recording' : 'Recording'}</span>
                </motion.button>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default VideoVerification;