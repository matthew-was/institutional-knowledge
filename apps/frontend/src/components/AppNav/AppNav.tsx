import Link from 'next/link';

export function AppNav() {
  return (
    <nav aria-label="Main navigation">
      <Link href="/upload">Document Intake</Link>
      <Link href="/curation">Curation</Link>
    </nav>
  );
}
