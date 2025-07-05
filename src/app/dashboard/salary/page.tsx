'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layouts/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

// Lazy load heavy salary components
const AddSalaryForm = dynamic(() => import('@/components/features/salary/add-salary-form').then(mod => ({ default: mod.AddSalaryForm })), {
  loading: () => <div className="animate-pulse h-64 bg-gray-200 rounded-lg"></div>,
});

const SalaryList = dynamic(() => import('@/components/features/salary/salary-list').then(mod => ({ default: mod.SalaryList })), {
  loading: () => <div className="animate-pulse h-32 bg-gray-200 rounded-lg"></div>,
});

export default function SalaryPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleAddSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Salary Records</h1>
            <p className="mt-2 text-gray-600">
              Track your salary history and compensation changes over time.
            </p>
          </div>
          <Button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Salary
          </Button>
        </div>

        <SalaryList
          refreshTrigger={refreshTrigger}
          onEdit={(record) => {
            // TODO: Implement edit functionality
            console.log('Edit salary:', record);
          }}
          onDelete={(record) => {
            // TODO: Implement delete functionality
            console.log('Delete salary:', record);
          }}
        />

        <AddSalaryForm
          isOpen={showAddForm}
          onClose={() => setShowAddForm(false)}
          onSuccess={handleAddSuccess}
        />
      </div>
    </DashboardLayout>
  );
}