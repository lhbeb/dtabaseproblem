import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Camera, X, Zap, ZapOff, FlipHorizontal, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Compressor from 'compressorjs';
import toast from 'react-hot-toast';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
  side: 'front' | 'back';
}

interface CameraCapabilities {
  maxWidth: number;
  maxHeight: number;
  supportsFlash: boolean;
  supportsFocus: boolean;
  facingModes: string[];
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose, side }) => {
  const webcamRef = useRef<Webcam>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  
  // Component state
  const [isCapturing, setIsCapturing] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(false);
  const [lightLevel, setLightLevel] = useState(0);
  const [isCardDetected, setIsCardDetected] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [capabilities, setCapabilities] = useState<CameraCapabilities | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualOverride, setManualOverride] = useState(false);

  // Cross-platform video constraints
  const getVideoConstraints = useCallback(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    const baseConstraints = {
      facingMode: isFrontCamera ? 'user' : 'environment',
      aspectRatio: 4/3, // Better for ID cards
    };

    if (isIOS) {
      // iOS Safari constraints - more conservative
      return {
        ...baseConstraints,
        width: { ideal: 1920, max: 2048 },
        height: { ideal: 1440, max: 1536 },
        frameRate: { ideal: 30, max: 30 }
      };
    } else if (isMobile) {
      // Android constraints
      return {
        ...baseConstraints,
        width: { ideal: 2560, max: 4096 },
        height: { ideal: 1920, max: 3072 },
        frameRate: { ideal: 30, max: 60 }
      };
    } else {
      // Desktop constraints
      return {
        ...baseConstraints,
        width: { ideal: 3840, max: 7680 },
        height: { ideal: 2880, max: 5760 },
        frameRate: { ideal: 30, max: 60 }
      };
    }
  }, [isFrontCamera]);

  // Detect camera capabilities
  useEffect(() => {
    const detectCapabilities = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: getVideoConstraints()
        });
        
        const videoTrack = stream.getVideoTracks()[0];
        const trackCapabilities = videoTrack.getCapabilities();
        
        setCapabilities({
          maxWidth: trackCapabilities.width?.max || 1920,
          maxHeight: trackCapabilities.height?.max || 1080,
          supportsFlash: 'torch' in trackCapabilities,
          supportsFocus: 'focusMode' in trackCapabilities,
          facingModes: trackCapabilities.facingMode || ['user', 'environment']
        });
        
        console.log('📱 Camera capabilities detected:', trackCapabilities);
        
        // Clean up test stream
        stream.getTracks().forEach(track => track.stop());
        
      } catch (error) {
        console.error('❌ Failed to detect camera capabilities:', error);
        setCameraError('Failed to access camera. Please check permissions.');
      }
    };
    
    detectCapabilities();
  }, [getVideoConstraints]);

  // Handle video stream ready
  useEffect(() => {
    const video = webcamRef.current?.video;
    if (!video) return;

    const handleLoadedMetadata = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setIsVideoReady(true);
        setCameraError(null);
        setIsCardDetected(true); // Immediately enable capture
        
        console.log('📸 Camera ready - capture enabled immediately:', {
          width: video.videoWidth,
          height: video.videoHeight,
          quality: video.videoWidth >= 3840 ? '4K+' : 
                   video.videoWidth >= 1920 ? 'Full HD' : 'HD'
        });
      }
    };

    const handleError = (error: Event) => {
      console.error('❌ Video error:', error);
      setCameraError('Camera stream error. Please try again.');
      setIsVideoReady(false);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);
    
    // Check if already ready
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      handleLoadedMetadata();
    }

    // Fallback: Force enable capture after 3 seconds regardless of conditions
    setTimeout(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setIsVideoReady(true);
        setIsCardDetected(true);
        console.log('🔧 Fallback: Force-enabled capture button');
      }
    }, 3000);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };
  }, []);

  // Simplified light level monitoring - no blocking detection
  useEffect(() => {
    if (!isVideoReady) return;

    let animationFrame: number;
    
    const monitorLighting = () => {
      const video = webcamRef.current?.video;
      
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
        animationFrame = requestAnimationFrame(monitorLighting);
        return;
      }

      try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (context) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0);
          
          // Simple brightness calculation for advisory purposes only
          const centerX = Math.floor(canvas.width * 0.4);
          const centerY = Math.floor(canvas.height * 0.4);
          const width = Math.floor(canvas.width * 0.2);
          const height = Math.floor(canvas.height * 0.2);
          
          const centerData = context.getImageData(centerX, centerY, width, height);
          
          let brightness = 0;
          const data = centerData.data;
          
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            brightness += (r + g + b) / 3;
          }
          
          brightness /= (data.length / 4);
          setLightLevel(brightness);
          
          // Card is "detected" when camera is ready - very permissive
          // This is just for visual feedback, doesn't block capture
          setIsCardDetected(brightness > 20 && brightness < 280); // Almost always true
        }
      } catch (error) {
        console.error('Error in lighting detection:', error);
        // If detection fails, assume card is detected so capture works
        setIsCardDetected(true);
      }
      
      animationFrame = requestAnimationFrame(monitorLighting);
    };

    // Set card detected immediately when camera is ready
    setIsCardDetected(true);
    monitorLighting();
    return () => cancelAnimationFrame(animationFrame);
  }, [isVideoReady]);

  const toggleCamera = useCallback(() => {
    if (!capabilities?.facingModes.includes(isFrontCamera ? 'environment' : 'user')) {
      toast.error('Camera switching not available on this device');
      return;
    }
    
    setIsFrontCamera(prev => !prev);
    setIsVideoReady(false);
    setIsCardDetected(false);
    setCameraError(null);
  }, [capabilities, isFrontCamera]);

  const toggleFlash = useCallback(async () => {
    if (!capabilities?.supportsFlash) {
      toast.error('Flash is not available on this device');
      return;
    }
    
    try {
      const track = webcamRef.current?.video?.srcObject?.getVideoTracks()[0];
      if (track) {
        await track.applyConstraints({
          advanced: [{ torch: !flashEnabled } as any]
        });
        setFlashEnabled(!flashEnabled);
        toast.success(`Flash ${!flashEnabled ? 'enabled' : 'disabled'}`);
      }
    } catch (error) {
      console.error('Flash toggle failed:', error);
      toast.error('Failed to toggle flash');
    }
  }, [flashEnabled, capabilities]);

  const captureImage = useCallback(async () => {
    if (!isVideoReady || !webcamRef.current) {
      toast.error('Camera not ready. Please wait.');
      return;
    }

    // No barriers - always allow capture when camera is ready
    console.log('📸 Capturing image - no conditions required');

    try {
      setIsCapturing(true);
      
      // Get high-quality screenshot
      const imageSrc = webcamRef.current.getScreenshot({
        width: capabilities?.maxWidth || 1920,
        height: capabilities?.maxHeight || 1080
      });
      
      if (!imageSrc) {
        throw new Error('Failed to capture image from camera');
      }

      console.log('📸 Screenshot captured, processing...');

      // Convert base64 to blob
      const response = await fetch(imageSrc);
      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error('Captured image is empty');
      }

      console.log('📊 Original image:', {
        size: blob.size,
        type: blob.type
      });

      // Compress image with optimal settings for ID cards
      const compressionSettings = {
        quality: 0.95, // High quality for text readability
        maxWidth: Math.min(capabilities?.maxWidth || 3840, 4096),
        maxHeight: Math.min(capabilities?.maxHeight || 2880, 3072),
        mimeType: 'image/jpeg' as const,
        checkOrientation: true,
        retainExif: false, // Remove EXIF for privacy
        convertTypes: ['image/png', 'image/webp'] as const,
        success: (compressedBlob: Blob) => {
          try {
            const timestamp = Date.now();
            const fileName = `${side}-id-${timestamp}.jpg`;
            
            const file = new File([compressedBlob], fileName, {
              type: 'image/jpeg',
              lastModified: timestamp
            });
            
            console.log('✅ Image processed successfully:', {
              name: file.name,
              size: file.size,
              type: file.type,
              compression: `${Math.round((1 - file.size / blob.size) * 100)}%`
            });
            
            // Validate the processed image
            validateImage(file).then(isValid => {
              if (isValid) {
                onCapture(file);
                toast.success('ID captured successfully!');
              } else {
                throw new Error('Processed image validation failed');
              }
            }).catch(error => {
              console.error('❌ Image validation failed:', error);
              toast.error('Image processing failed. Please try again.');
            });
            
          } catch (error) {
            console.error('❌ File creation failed:', error);
            toast.error('Failed to process image. Please try again.');
          }
        },
        error: (err: Error) => {
          console.error('❌ Image compression failed:', err);
          toast.error('Image compression failed. Please try again.');
        },
      };

      new Compressor(blob, compressionSettings);
      
    } catch (error) {
      console.error('❌ Capture failed:', error);
      toast.error('Failed to capture image. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [onCapture, side, isVideoReady, capabilities]);

  // Validate processed image
  const validateImage = useCallback((file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const img = document.createElement('img');
      const url = URL.createObjectURL(file);
      
      const cleanup = () => {
        URL.revokeObjectURL(url);
        img.remove();
      };
      
      const timeout = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 5000);
      
      img.onload = () => {
        clearTimeout(timeout);
        const isValid = img.naturalWidth > 0 && 
                       img.naturalHeight > 0 &&
                       img.naturalWidth >= 800 && // Minimum resolution for ID cards
                       img.naturalHeight >= 600;
        cleanup();
        resolve(isValid);
      };
      
      img.onerror = () => {
        clearTimeout(timeout);
        cleanup();
        resolve(false);
      };
      
      img.src = url;
    });
  }, []);

  // Hide guide after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowGuide(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  const getLightingStatus = () => {
    if (!isVideoReady) return '📷 Camera Initializing';
    if (lightLevel < 40) return '💡 Consider Using Flash';
    if (lightLevel > 250) return '☀️ Very Bright - May Reduce Quality';
    if (lightLevel < 80) return '🌙 Dim Lighting - Flash Recommended';
    if (lightLevel > 180) return '☀️ Bright Lighting - Good';
    return '✨ Excellent Lighting';
  };

  const getQualityIndicator = () => {
    if (!capabilities) return '';
    const maxRes = capabilities.maxWidth;
    if (maxRes >= 3840) return '4K+';
    if (maxRes >= 1920) return 'FHD';
    return 'HD';
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
    >
      <div className="relative w-full h-full">
        {/* Error state */}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-center text-white p-6">
              <Camera className="w-16 h-16 mx-auto mb-4 text-red-500" />
              <h3 className="text-xl font-bold mb-2">Camera Error</h3>
              <p className="text-gray-300 mb-4">{cameraError}</p>
              <button
                onClick={() => window.location.reload()}
                className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Camera view */}
        {!cameraError && (
          <>
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              screenshotQuality={1.0}
              videoConstraints={getVideoConstraints()}
              className="w-full h-full object-cover"
              onUserMedia={() => console.log('📹 Camera stream started')}
              onUserMediaError={(error) => {
                console.error('❌ Camera access error:', error);
                setCameraError('Camera access denied. Please allow camera access.');
              }}
            />

            {/* ID Card Frame */}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                ref={frameRef}
                className={`relative w-[85%] max-w-lg aspect-[1.586] border-2 ${
                  isCardDetected ? 'border-green-500' : 'border-white'
                } rounded-lg transition-colors duration-300`}
              >
                {/* Corner Markers */}
                {[
                  'top-0 left-0 border-l-2 border-t-2 rounded-tl-lg',
                  'top-0 right-0 border-r-2 border-t-2 rounded-tr-lg',
                  'bottom-0 left-0 border-l-2 border-b-2 rounded-bl-lg',
                  'bottom-0 right-0 border-r-2 border-b-2 rounded-br-lg'
                ].map((classes, index) => (
                  <div
                    key={index}
                    className={`absolute w-8 h-8 ${classes} ${
                      isCardDetected ? 'border-green-500' : 'border-white'
                    } transition-colors duration-300`}
                  />
                ))}
              </motion.div>
            </div>

            {/* Initial Guide */}
            <AnimatePresence>
              {showGuide && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/70 flex items-center justify-center"
                >
                  <div className="text-center text-white space-y-4 p-6">
                    <h2 className="text-2xl font-bold">Capture Your {side === 'front' ? 'Front' : 'Back'} ID</h2>
                    <ul className="text-lg space-y-2">
                      <li>• Position your ID within the frame</li>
                      <li>• Tap the green button to capture</li>
                      <li>• Works in any lighting condition</li>
                      <li>• Hold steady for best results</li>
                    </ul>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Status Bar */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent">
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              
              <div className="text-white text-sm font-medium px-4 py-2 bg-black/30 rounded-full">
                {getQualityIndicator()} | {isVideoReady ? '✅ Ready to Capture' : '📷 Initializing...'}
              </div>
              
              <button
                onClick={toggleFlash}
                disabled={!capabilities?.supportsFlash}
                className="p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors disabled:opacity-50"
              >
                {flashEnabled ? <Zap className="w-6 h-6" /> : <ZapOff className="w-6 h-6" />}
              </button>
            </div>

            {/* Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-6 flex justify-between items-center bg-gradient-to-t from-black/50 to-transparent">
              <button
                onClick={toggleCamera}
                disabled={!capabilities?.facingModes.includes(isFrontCamera ? 'environment' : 'user')}
                className="p-3 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors disabled:opacity-50"
              >
                <FlipHorizontal className="w-6 h-6" />
              </button>

              <button
                onClick={captureImage}
                disabled={isCapturing || !isVideoReady}
                className={`p-5 rounded-full transition-all ${
                  isVideoReady && !isCapturing
                    ? 'bg-green-500 hover:bg-green-600 ring-2 ring-green-300 ring-opacity-50' 
                    : 'bg-white/30 cursor-not-allowed'
                }`}
              >
                {isCapturing ? (
                  <Loader2 className="w-8 h-8 animate-spin text-white" />
                ) : (
                  <Camera className="w-8 h-8 text-white" />
                )}
              </button>

              <div className="w-12" />
            </div>

            {/* Lighting Indicator */}
            <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2">
              <div className="px-4 py-2 rounded-full bg-black/30 text-white text-sm">
                {getLightingStatus()}
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default CameraCapture;