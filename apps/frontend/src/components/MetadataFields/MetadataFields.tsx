'use client';

interface MetadataFieldsProps {
  date: string;
  description: string;
  onDateChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
}

export function MetadataFields({
  date,
  description,
  onDateChange,
  onDescriptionChange,
}: MetadataFieldsProps) {
  return (
    <div>
      <div>
        <label htmlFor="document-date">Date</label>
        <input
          id="document-date"
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="document-description">Description</label>
        <input
          id="document-description"
          type="text"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
      </div>
    </div>
  );
}
