import { useState, useCallback, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/config/firebase';
import { compressImage, validateImageFile } from '../utils/imageUtils';
import { UsersService } from '../services/users';
import type { User as UserRecord } from '../types/firestore';

interface UseProfileImageUploadOptions {
  user: UserRecord | null;
  onSuccess?: (photoUrl: string) => void;
  onError?: (error: string) => void;
  onDeleteSuccess?: () => void;
}

export function useProfileImageUpload({
  user,
  onSuccess,
  onError,
  onDeleteSuccess
}: UseProfileImageUploadOptions) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.isValid) {
      const errorMsg = validation.error || 'Archivo de imagen inválido';
      onError?.(errorMsg);
      return;
    }

    setSelectedFile(file);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
  }, [onError]);

  const uploadImage = useCallback(async (): Promise<string | null> => {
    if (!selectedFile || !user?.id) return null;

    setIsUploading(true);

    try {
      // Compress the image
      const compressedBlob = await compressImage(selectedFile);

      // Create storage reference
      const fileName = `${user.id}.jpg`;
      const storageRef = ref(storage, `ProfileImages/${fileName}`);

      // Upload the compressed image
      await uploadBytes(storageRef, compressedBlob, {
        contentType: 'image/jpeg'
      });

      // Get download URL
      const downloadURL = await getDownloadURL(storageRef);

      // Update user profile
      const targetId = user.id;
      await UsersService.updateUserAs(user, targetId, { photoUrl: downloadURL });

      // Clear selection
      setSelectedFile(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      onSuccess?.(downloadURL);
      return downloadURL;
    } catch (err) {
      console.error('Error uploading image:', err);
      const message = err instanceof Error ? err.message : 'Error al subir la imagen';
      onError?.(message);
      throw err;
    } finally {
      setIsUploading(false);
    }
  }, [selectedFile, user, onSuccess, onError]);

  const deleteImage = useCallback(async () => {
    if (!user?.id) return;

    setIsDeleting(true);

    try {
      // Delete from storage
      const fileName = `${user.id}.jpg`;
      const storageRef = ref(storage, `ProfileImages/${fileName}`);
      await deleteObject(storageRef);

      // Update user profile
      const targetId = user.id;
      await UsersService.updateUserAs(user, targetId, { photoUrl: undefined });

      // Clear any preview
      if (selectedFile) {
        setSelectedFile(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }

      onDeleteSuccess?.();
    } catch (err) {
      console.error('Error deleting image:', err);
      const message = err instanceof Error ? err.message : 'Error al eliminar la imagen';
      onError?.(message);
      throw err;
    } finally {
      setIsDeleting(false);
    }
  }, [user, selectedFile, onError, onDeleteSuccess]);

  const cancelSelection = useCallback(() => {
    setSelectedFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    // State
    selectedFile,
    imagePreview,
    isUploading,
    isDeleting,
    fileInputRef,

    // Actions
    handleFileSelect,
    uploadImage,
    deleteImage,
    cancelSelection,
    openFileDialog,

    // Computed
    hasSelectedFile: selectedFile !== null,
    canDelete: Boolean(user?.photoUrl || selectedFile),
    isProcessing: isUploading || isDeleting
  };
}