import { config } from '../../../../server/config/index';

export default function UploadPage() {
  const { maxFileSizeMb } = config.upload;
  return (
    <p>TODO: DocumentUploadForm (Task 5) — maxFileSizeMb: {maxFileSizeMb}</p>
  );
}
