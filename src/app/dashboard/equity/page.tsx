import dynamic from 'next/dynamic';

// Lazy load equity components
const EquityList = dynamic(() => import('@/components/features/equity').then(mod => ({ default: mod.EquityList })), {
  loading: () => (
    <div className="container mx-auto px-6 py-8">
      <div className="animate-pulse h-64 bg-gray-200 rounded-lg"></div>
    </div>
  ),
});

export default function EquityPage() {
  return (
    <div className="container mx-auto px-6 py-8">
      <EquityList />
    </div>
  );
}

export const metadata = {
  title: 'Equity Grants | CompTrails',
  description: 'Track and manage your equity compensation',
};