interface UploadSuccessMessageProps {
  description: string;
  date: string | null;
  archiveReference: string;
}

export function UploadSuccessMessage({
  description,
  date,
  archiveReference,
}: UploadSuccessMessageProps) {
  return (
    <div>
      <p>Document uploaded successfully.</p>
      <ul>
        <li>Description: {description}</li>
        <li>
          Date:{' '}
          {date !== null ? <time dateTime={date}>{date}</time> : 'Undated'}
        </li>
        <li>Archive reference: {archiveReference}</li>
      </ul>
    </div>
  );
}
