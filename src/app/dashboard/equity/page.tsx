import { EquityList } from '@/components/features/equity';

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