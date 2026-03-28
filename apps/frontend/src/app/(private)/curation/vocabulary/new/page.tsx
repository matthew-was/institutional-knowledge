import { AddVocabularyTermForm } from '@/components/AddVocabularyTermForm/AddVocabularyTermForm';

/**
 * Page for manually entering a new vocabulary term.
 * No data fetching on load — the form manages its own state.
 */
export default function AddVocabularyTermPage() {
  return (
    <>
      <h1>Add Vocabulary Term</h1>
      <AddVocabularyTermForm />
    </>
  );
}
