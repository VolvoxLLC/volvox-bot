import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Volvox',
  description: 'Privacy Policy for Volvox.',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-24">
      <h1 className="text-4xl font-black tracking-tight text-foreground">Privacy Policy</h1>
      <p className="text-muted-foreground">Coming soon.</p>
    </main>
  );
}
