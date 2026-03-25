'use client';

import type { ParsedFilename } from '@/lib/parseFilename';
import { parseFilename } from '@/lib/parseFilename';

interface FilePickerInputProps {
  acceptedExtensions: string[];
  onFileSelect: (file: File, parsed: ParsedFilename | null) => void;
}

export function FilePickerInput({
  acceptedExtensions,
  onFileSelect,
}: FilePickerInputProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const lastDot = file.name.lastIndexOf('.');
    const stem = lastDot > 0 ? file.name.slice(0, lastDot) : file.name;
    const parsed = parseFilename(stem);

    onFileSelect(file, parsed);
  }

  return (
    <div>
      <label htmlFor="file-upload">Select document</label>
      <input
        id="file-upload"
        type="file"
        accept={acceptedExtensions.join(',')}
        onChange={handleChange}
      />
    </div>
  );
}
