import dynamic from 'next/dynamic';

// Lazy load bonus components
const BonusList = dynamic(() => import('@/components/features/bonus').then(mod => ({ default: mod.BonusList })), {
  loading: () => (
    <div className="container mx-auto px-6 py-8">
      <div className="animate-pulse h-64 bg-gray-200 rounded-lg"></div>
    </div>
  ),
});

export default function BonusesPage() {
  return (
    <div className="container mx-auto px-6 py-8">
      <BonusList />
    </div>
  );
}

export const metadata = {
  title: 'Bonuses | CompTrails',
  description: 'Track and manage your bonus compensation',
};