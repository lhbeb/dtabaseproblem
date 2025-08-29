import { supabase } from '../lib/supabase-simple';

export interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'preparing' | 'uploading' | 'verifying' | 'completed' | 'error';
  error?: string;
}

export interface UploadResult {
  success: boolean;
  filePath?: string;
  error?: string;
  fileSize?: number;
  fileType?: string;
}

/**
 * Cross-platform file upload utility with corruption prevention
 */
export class FileUploader {
  private static readonly MAX_RETRY_ATTEMPTS = 3;
  private static readonly CHUNK_SIZE = 1024 * 1024; // 1MB chunks for large files
  
  /**
   * Upload a single file with validation and corruption prevention
   */
  static async uploadFile(
    file: File | Blob,
    fileName: string,
    folderPath: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    let attempt = 0;
    
    while (attempt < this.MAX_RETRY_ATTEMPTS) {
      try {
        attempt++;
        console.log(`📤 Upload attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS} for ${fileName}`);
        
        // Step 1: Prepare file
        onProgress?.({
          fileName,
          progress: 0,
          status: 'preparing'
        });
        
        const preparedFile = await this.prepareFile(file, fileName);
        if (!preparedFile.success) {
          throw new Error(preparedFile.error);
        }
        
        // Step 2: Validate file before upload
        const validation = await this.validateFile(preparedFile.file!, fileName);
        if (!validation.isValid) {
          throw new Error(`File validation failed: ${validation.error}`);
        }
        
        console.log('✅ File validation passed:', validation);
        
        // Step 3: Upload file
        onProgress?.({
          fileName,
          progress: 20,
          status: 'uploading'
        });
        
        const uploadResult = await this.performUpload(
          preparedFile.file!,
          fileName,
          folderPath,
          (progress) => {
            onProgress?.({
              fileName,
              progress: 20 + (progress * 0.6), // 20% to 80%
              status: 'uploading'
            });
          }
        );
        
        if (!uploadResult.success) {
          throw new Error(uploadResult.error);
        }
        
        // Step 4: Verify upload
        onProgress?.({
          fileName,
          progress: 80,
          status: 'verifying'
        });
        
        const verification = await this.verifyUpload(uploadResult.filePath!, preparedFile.file!);
        if (!verification.success) {
          // Delete corrupted file and retry
          await this.deleteFile(uploadResult.filePath!);
          throw new Error(verification.error);
        }
        
        onProgress?.({
          fileName,
          progress: 100,
          status: 'completed'
        });
        
        console.log(`✅ File ${fileName} uploaded and verified successfully`);
        
        return {
          success: true,
          filePath: uploadResult.filePath,
          fileSize: preparedFile.file!.size,
          fileType: preparedFile.file!.type
        };
        
      } catch (error) {
        console.error(`❌ Upload attempt ${attempt} failed for ${fileName}:`, error);
        
        if (attempt === this.MAX_RETRY_ATTEMPTS) {
          onProgress?.({
            fileName,
            progress: 0,
            status: 'error',
            error: error instanceof Error ? error.message : 'Upload failed'
          });
          
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Upload failed after multiple attempts'
          };
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    return {
      success: false,
      error: 'Upload failed after maximum retry attempts'
    };
  }
  
  /**
   * Prepare file for upload - convert Blob to File, validate type, etc.
   */
  private static async prepareFile(file: File | Blob, fileName: string): Promise<{
    success: boolean;
    file?: File;
    error?: string;
  }> {
    try {
      let preparedFile: File;
      
      if (file instanceof File) {
        preparedFile = file;
      } else {
        // Convert Blob to File with proper metadata
        const mimeType = this.getMimeTypeFromFileName(fileName);
        preparedFile = new File([file], fileName, {
          type: mimeType,
          lastModified: Date.now()
        });
      }
      
      // Validate file size
      if (preparedFile.size === 0) {
        throw new Error('File is empty');
      }
      
      if (preparedFile.size > 50 * 1024 * 1024) { // 50MB limit
        throw new Error('File is too large (max 50MB)');
      }
      
      console.log('📋 File prepared:', {
        name: preparedFile.name,
        size: preparedFile.size,
        type: preparedFile.type,
        lastModified: new Date(preparedFile.lastModified).toISOString()
      });
      
      return {
        success: true,
        file: preparedFile
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'File preparation failed'
      };
    }
  }
  
  /**
   * Validate file integrity before upload
   */
  private static async validateFile(file: File, fileName: string): Promise<{
    isValid: boolean;
    error?: string;
    metadata?: any;
  }> {
    try {
      if (fileName.endsWith('.webm')) {
        return await this.validateVideo(file);
      } else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
        return await this.validateImage(file);
      } else if (fileName.endsWith('.txt')) {
        return await this.validateText(file);
      }
      
      // Default validation for other files
      return {
        isValid: file.size > 0,
        error: file.size === 0 ? 'File is empty' : undefined
      };
      
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }
  }
  
  /**
   * Validate video file
   */
  private static validateVideo(file: File): Promise<{
    isValid: boolean;
    error?: string;
    metadata?: any;
  }> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      
      const cleanup = () => {
        URL.revokeObjectURL(url);
        video.remove();
      };
      
      const timeout = setTimeout(() => {
        cleanup();
        resolve({
          isValid: false,
          error: 'Video validation timeout'
        });
      }, 10000);
      
      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        
        const isValid = video.duration > 0 && 
                       video.videoWidth > 0 && 
                       video.videoHeight > 0 &&
                       video.duration < 300; // Max 5 minutes
        
        const metadata = {
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight
        };
        
        cleanup();
        resolve({
          isValid,
          error: isValid ? undefined : 'Invalid video format or dimensions',
          metadata
        });
      };
      
      video.onerror = () => {
        clearTimeout(timeout);
        cleanup();
        resolve({
          isValid: false,
          error: 'Video file is corrupted or unsupported format'
        });
      };
      
      video.src = url;
      video.load();
    });
  }
  
  /**
   * Validate image file
   */
  private static validateImage(file: File): Promise<{
    isValid: boolean;
    error?: string;
    metadata?: any;
  }> {
    return new Promise((resolve) => {
      const img = document.createElement('img');
      const url = URL.createObjectURL(file);
      
      const cleanup = () => {
        URL.revokeObjectURL(url);
        img.remove();
      };
      
      const timeout = setTimeout(() => {
        cleanup();
        resolve({
          isValid: false,
          error: 'Image validation timeout'
        });
      }, 5000);
      
      img.onload = () => {
        clearTimeout(timeout);
        
        const isValid = img.naturalWidth > 0 && 
                       img.naturalHeight > 0 &&
                       img.naturalWidth <= 8192 && 
                       img.naturalHeight <= 8192;
        
        const metadata = {
          width: img.naturalWidth,
          height: img.naturalHeight
        };
        
        cleanup();
        resolve({
          isValid,
          error: isValid ? undefined : 'Invalid image dimensions',
          metadata
        });
      };
      
      img.onerror = () => {
        clearTimeout(timeout);
        cleanup();
        resolve({
          isValid: false,
          error: 'Image file is corrupted or unsupported format'
        });
      };
      
      img.src = url;
    });
  }
  
  /**
   * Validate text file
   */
  private static async validateText(file: File): Promise<{
    isValid: boolean;
    error?: string;
    metadata?: any;
  }> {
    try {
      const text = await file.text();
      return {
        isValid: text.length > 0 && text.length < 1000000, // Max 1MB text
        error: text.length === 0 ? 'Text file is empty' : 
               text.length >= 1000000 ? 'Text file is too large' : undefined,
        metadata: {
          length: text.length,
          lines: text.split('\n').length
        }
      };
    } catch (error) {
      return {
        isValid: false,
        error: 'Failed to read text file'
      };
    }
  }
  
  /**
   * Perform the actual upload with multiple methods
   */
  private static async performUpload(
    file: File,
    fileName: string,
    folderPath: string,
    onProgress?: (progress: number) => void
  ): Promise<{
    success: boolean;
    filePath?: string;
    error?: string;
  }> {
    const filePath = `${folderPath}/${fileName}`;
    const uploadMethods = [
      () => this.uploadMethod1(file, filePath, onProgress),
      () => this.uploadMethod2(file, filePath, onProgress),
      () => this.uploadMethod3(file, filePath, onProgress)
    ];
    
    for (let i = 0; i < uploadMethods.length; i++) {
      try {
        console.log(`🔄 Trying upload method ${i + 1} for ${fileName}`);
        const result = await uploadMethods[i]();
        
        if (result.success) {
          console.log(`✅ Upload method ${i + 1} succeeded for ${fileName}`);
          return result;
        }
      } catch (error) {
        console.warn(`⚠️ Upload method ${i + 1} failed for ${fileName}:`, error);
        if (i === uploadMethods.length - 1) {
          throw error;
        }
      }
    }
    
    return {
      success: false,
      error: 'All upload methods failed'
    };
  }
  
  /**
   * Upload method 1: Standard Supabase upload
   */
  private static async uploadMethod1(
    file: File,
    filePath: string,
    onProgress?: (progress: number) => void
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    onProgress?.(0);
    
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type
      });
    
    onProgress?.(100);
    
    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
    
    return {
      success: true,
      filePath
    };
  }
  
  /**
   * Upload method 2: ArrayBuffer upload
   */
  private static async uploadMethod2(
    file: File,
    filePath: string,
    onProgress?: (progress: number) => void
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    onProgress?.(0);
    
    const arrayBuffer = await file.arrayBuffer();
    onProgress?.(30);
    
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, arrayBuffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type
      });
    
    onProgress?.(100);
    
    if (error) {
      throw new Error(`ArrayBuffer upload failed: ${error.message}`);
    }
    
    return {
      success: true,
      filePath
    };
  }
  
  /**
   * Upload method 3: Basic upload without options
   */
  private static async uploadMethod3(
    file: File,
    filePath: string,
    onProgress?: (progress: number) => void
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    onProgress?.(0);
    
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, file);
    
    onProgress?.(100);
    
    if (error) {
      throw new Error(`Basic upload failed: ${error.message}`);
    }
    
    return {
      success: true,
      filePath
    };
  }
  
  /**
   * Verify uploaded file by downloading and comparing
   */
  private static async verifyUpload(filePath: string, originalFile: File): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log(`🔍 Verifying upload: ${filePath}`);
      
      const { data, error } = await supabase.storage
        .from('documents')
        .download(filePath);
      
      if (error) {
        throw new Error(`Download verification failed: ${error.message}`);
      }
      
      if (!data) {
        throw new Error('Downloaded file is null');
      }
      
      // Check file size
      if (data.size !== originalFile.size) {
        throw new Error(`File size mismatch: expected ${originalFile.size}, got ${data.size}`);
      }
      
      // For critical files, also verify content hash
      if (filePath.includes('verification_') || filePath.includes('id_')) {
        const originalHash = await this.calculateFileHash(originalFile);
        const downloadedHash = await this.calculateFileHash(data);
        
        if (originalHash !== downloadedHash) {
          throw new Error('File content hash mismatch - file corrupted during upload');
        }
        
        console.log('✅ File hash verification passed');
      }
      
      console.log('✅ Upload verification passed:', {
        originalSize: originalFile.size,
        downloadedSize: data.size,
        path: filePath
      });
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Upload verification failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed'
      };
    }
  }
  
  /**
   * Calculate file hash for integrity verification
   */
  private static async calculateFileHash(file: File | Blob): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  /**
   * Delete file from storage
   */
  private static async deleteFile(filePath: string): Promise<void> {
    try {
      await supabase.storage.from('documents').remove([filePath]);
      console.log(`🗑️ Deleted corrupted file: ${filePath}`);
    } catch (error) {
      console.warn(`⚠️ Failed to delete file ${filePath}:`, error);
    }
  }
  
  /**
   * Get MIME type from file name
   */
  private static getMimeTypeFromFileName(fileName: string): string {
    const extension = fileName.toLowerCase().split('.').pop();
    
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'webm': 'video/webm',
      'mp4': 'video/mp4',
      'txt': 'text/plain',
      'json': 'application/json',
      'pdf': 'application/pdf'
    };
    
    return mimeTypes[extension || ''] || 'application/octet-stream';
  }
  
  /**
   * Upload multiple files with progress tracking
   */
  static async uploadMultipleFiles(
    files: Array<{ file: File | Blob; fileName: string }>,
    folderPath: string,
    onProgress?: (fileName: string, progress: UploadProgress) => void
  ): Promise<{
    success: boolean;
    results: Array<{ fileName: string; result: UploadResult }>;
    failedFiles: string[];
  }> {
    const results: Array<{ fileName: string; result: UploadResult }> = [];
    const failedFiles: string[] = [];
    
    console.log(`📦 Starting upload of ${files.length} files to ${folderPath}`);
    
    for (const { file, fileName } of files) {
      try {
        const result = await this.uploadFile(
          file,
          fileName,
          folderPath,
          (progress) => onProgress?.(fileName, progress)
        );
        
        results.push({ fileName, result });
        
        if (!result.success) {
          failedFiles.push(fileName);
        }
        
      } catch (error) {
        console.error(`❌ Failed to upload ${fileName}:`, error);
        failedFiles.push(fileName);
        results.push({
          fileName,
          result: {
            success: false,
            error: error instanceof Error ? error.message : 'Upload failed'
          }
        });
      }
    }
    
    const success = failedFiles.length === 0;
    
    console.log(`📊 Upload summary: ${results.length - failedFiles.length}/${results.length} successful`);
    
    return {
      success,
      results,
      failedFiles
    };
  }
}
