import Link from 'next/link';
import { redirect } from 'next/navigation';
import { UploadSuccessMessage } from '@/components/UploadSuccessMessage/UploadSuccessMessage';

interface SuccessPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function UploadSuccessPage({
  searchParams,
}: SuccessPageProps) {
  const params = await searchParams;

  const description =
    typeof params.description === 'string' ? params.description : '';
  const rawDate = typeof params.date === 'string' ? params.date : '';
  const archiveReference =
    typeof params.archiveReference === 'string' ? params.archiveReference : '';

  if (!description || !archiveReference) {
    redirect('/upload');
  }

  const date = rawDate === '' ? null : rawDate;

  return (
    <div>
      <UploadSuccessMessage
        description={description}
        date={date}
        archiveReference={archiveReference}
      />
      <Link href="/upload">Upload another document</Link>
    </div>
  );
}
