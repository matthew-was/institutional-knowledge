import type { DocumentDetailResponse } from '@institutional-knowledge/shared';
import { DocumentMetadataForm } from '@/components/DocumentMetadataForm/DocumentMetadataForm';
import { config } from '@/lib/config';

interface DocumentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentDetailPage({
  params,
}: DocumentDetailPageProps) {
  const { id } = await params;
  const url = `http://${config.server.host}:${config.server.port}/api/curation/documents/${id}`;

  let document: DocumentDetailResponse;

  try {
    const response = await fetch(url, { cache: 'no-store' });

    if (response.status === 404) {
      return (
        <div role="alert">
          <p>Document not found.</p>
        </div>
      );
    }

    if (!response.ok) {
      return (
        <div role="alert">
          <p>Failed to load document. Please try again.</p>
        </div>
      );
    }

    document = (await response.json()) as DocumentDetailResponse;
  } catch {
    return (
      <div role="alert">
        <p>Failed to load document. Please try again.</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Edit document metadata</h1>
      <p>Archive reference: {document.archiveReference}</p>
      <DocumentMetadataForm document={document} />
    </div>
  );
}
