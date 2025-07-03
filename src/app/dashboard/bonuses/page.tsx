import { BonusList } from '@/components/features/bonus';

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