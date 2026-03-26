'use client';

import type { DocumentQueueItem as DocumentQueueItemType } from '@institutional-knowledge/shared';
import Link from 'next/link';
import { ClearFlagButton } from '@/components/ClearFlagButton/ClearFlagButton';
import { useClearFlag } from './useClearFlag';

interface Props extends DocumentQueueItemType {
  onSuccess: () => void;
}

export function DocumentQueueItem({
  documentId,
  description,
  date,
  flagReason,
  flaggedAt,
  submitterIdentity,
  onSuccess,
}: Props) {
  const { handleClear, isClearing, error } = useClearFlag(
    documentId,
    onSuccess,
  );

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
