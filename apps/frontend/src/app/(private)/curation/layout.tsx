import { CurationNav } from '@/components/CurationNav/CurationNav';

export default function CurationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <CurationNav />
      {children}
    </>
  );
}
