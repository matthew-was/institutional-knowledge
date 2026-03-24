import { AppNav } from '@/components/AppNav/AppNav';

export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header>
        <AppNav />
      </header>
      <main>{children}</main>
    </>
  );
}
