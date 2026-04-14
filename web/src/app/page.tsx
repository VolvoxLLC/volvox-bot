'use client';

import dynamic from 'next/dynamic';
import { FeatureGrid, Footer, Hero, Pricing } from '@/components/landing';
import { LandingNavbar } from '@/components/layout/LandingNavbar';

// Below-fold sections lazy-loaded for performance
const DashboardShowcase = dynamic(
  () =>
    import('@/components/landing/DashboardShowcase').then((m) => ({
      default: m.DashboardShowcase,
    })),
  { ssr: false },
);
const ComparisonTable = dynamic(
  () =>
    import('@/components/landing/ComparisonTable').then((m) => ({ default: m.ComparisonTable })),
  { ssr: false },
);
const Stats = dynamic(
  () => import('@/components/landing/Stats').then((m) => ({ default: m.Stats })),
  { ssr: false },
);

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      
      {/* Dynamic Navbar */}
      <LandingNavbar />

      {/* Hero Section */}
      <Hero />

      {/* Dashboard Showcase */}
      <div id="dashboard">
        <DashboardShowcase />
      </div>

      {/* Competitor Comparison */}
      <div id="compare">
        <ComparisonTable />
      </div>

      {/* Features Section */}
      <div id="features">
        <FeatureGrid />
      </div>

      {/* Pricing Section */}
      <div id="pricing">
        <Pricing />
      </div>

      {/* Stats / Testimonials Section */}
      <Stats />

      {/* Footer CTA */}
      <Footer />
    </div>
  );
}
