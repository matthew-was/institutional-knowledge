import Link from 'next/link';

export default function CurationPage() {
  return (
    <>
      <h1>Curation</h1>
      <ul>
        <li>
          <Link href="/curation/documents">Documents</Link>
        </li>
        <li>
          <Link href="/curation/vocabulary">Vocabulary</Link>
        </li>
      </ul>
    </>
  );
}
