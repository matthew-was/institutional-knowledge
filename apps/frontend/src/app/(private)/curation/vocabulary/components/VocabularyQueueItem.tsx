import type { VocabularyCandidateItem } from '@institutional-knowledge/shared';
import { AcceptCandidateButton } from '@/components/AcceptCandidateButton/AcceptCandidateButton';
import { RejectCandidateButton } from '@/components/RejectCandidateButton/RejectCandidateButton';

interface Props extends VocabularyCandidateItem {
  onSuccess: () => void;
}

export function VocabularyQueueItem({
  termId,
  term,
  category,
  confidence,
  sourceDocumentDescription,
  onSuccess,
}: Props) {
  const confidenceDisplay = confidence !== null ? confidence.toString() : 'N/A';

  return (
    <div>
      <p>Term: {term}</p>
      <p>Category: {category}</p>
      <p>Confidence: {confidenceDisplay}</p>
      <p>
        Source document:{' '}
        {sourceDocumentDescription !== null
          ? sourceDocumentDescription
          : 'No description'}
      </p>
      <AcceptCandidateButton termId={termId} onSuccess={onSuccess} />
      <RejectCandidateButton termId={termId} onSuccess={onSuccess} />
    </div>
  );
}
