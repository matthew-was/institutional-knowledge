import Link from 'next/link';

export function CurationNav() {
  return (
    <nav aria-label="Curation navigation">
      <Link href="/curation/documents">Documents</Link>
      <Link href="/curation/vocabulary">Vocabulary</Link>
    </nav>
  );
}
