'use client';

import type { DocumentQueueItem as DocumentQueueItemProps } from '@institutional-knowledge/shared';
import Link from 'next/link';
import { ClearFlagButton } from '@/components/ClearFlagButton/ClearFlagButton';
import { useClearFlag } from './useClearFlag';

export function DocumentQueueItem({
  documentId,
  description,
  date,
  flagReason,
  flaggedAt,
  submitterIdentity,
}: DocumentQueueItemProps) {
  // onSuccess is a no-op here; Task 9 wires the real re-fetch via mutate().
  const { handleClear, isClearing, error } = useClearFlag(documentId, () => {});

  return (
    <div>
      <p>{description}</p>
      <p>
        Date: {date !== null ? <time dateTime={date}>{date}</time> : 'Undated'}
      </p>
      <p>Flag reason: {flagReason}</p>
      <p>
        Flagged at: <time dateTime={flaggedAt}>{flaggedAt}</time>
      </p>
      <p>Submitted by: {submitterIdentity}</p>
      <ClearFlagButton
        onClick={handleClear}
        isLoading={isClearing}
        error={error}
      />
      <Link href={`/curation/documents/${documentId}`}>Edit metadata</Link>
    </div>
  );
}
