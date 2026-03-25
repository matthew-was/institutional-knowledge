import { DocumentUploadForm } from '@/components/DocumentUploadForm/DocumentUploadForm';
import { config } from '@/lib/config';

export default function UploadPage() {
  const { maxFileSizeMb, acceptedExtensions } = config.upload;
  return (
    <DocumentUploadForm
      maxFileSizeMb={maxFileSizeMb}
      acceptedExtensions={acceptedExtensions}
    />
  );
}
