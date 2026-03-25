'use client';

export interface DuplicateRecord {
  description: string;
  date: string | null;
  archiveReference: string;
}

interface DuplicateConflictAlertProps {
  existingRecord: DuplicateRecord;
}

export function DuplicateConflictAlert({
  existingRecord,
}: DuplicateConflictAlertProps) {
  const displayDate = existingRecord.date ?? 'Undated';

  return (
    <div role="alert" aria-live="assertive">
      <p>A document with this file already exists:</p>
      <ul>
        <li>Description: {existingRecord.description}</li>
        <li>Date: {displayDate}</li>
        <li>Archive reference: {existingRecord.archiveReference}</li>
      </ul>
    </div>
  );
}
