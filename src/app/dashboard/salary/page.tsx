'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layouts/dashboard-layout';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { LocalStorageService } from '@/services/localStorageService';
import { sessionDataCache } from '@/services/sessionDataCache';
import { AnalyticsService } from '@/services/analyticsService';
import { Plus, Trash2 } from 'lucide-react';

// Lazy load heavy salary components
const AddSalaryForm = dynamic(() => import('@/components/features/salary/add-salary-form').then(mod => ({ default: mod.AddSalaryForm })), {
  loading: () => <div className="animate-pulse h-64 bg-gray-200 rounded-lg"></div>,
});

const SalaryList = dynamic(() => import('@/components/features/salary/salary-list').then(mod => ({ default: mod.SalaryList })), {
  loading: () => <div className="animate-pulse h-32 bg-gray-200 rounded-lg"></div>,
});

// Import required types
import type { DecryptedSalaryData, CompensationRecord } from '@/lib/db/types';
import { useCompensationDetails } from '@/hooks/useCompensationDetails';
import type { SalarySummary } from '@/hooks/useCompensationSummaries';

// Create a properly typed salary record interface that matches AddSalaryForm expectations
interface DecryptedSalaryRecord extends CompensationRecord {
  decryptedData: DecryptedSalaryData;
}

// Type alias for hook return type  
type HookSalaryRecord = SalarySummary;

export default function SalaryPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editRecord, setEditRecord] = useState<DecryptedSalaryRecord | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [deleteRecord, setDeleteRecord] = useState<DecryptedSalaryRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { user, loading } = useAuth();
  const router = useRouter();
  
  // Use optimized summary data for display (SalaryList handles its own state)
  // const summaryState = useOptimizedPageState('salary'); // Not needed since SalaryList uses its own hook
  
  // Use details hook for loading full records when editing
  const { loadRecordDetails } = useCompensationDetails();

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

  const handleEditSuccess = () => {
    setEditRecord(null);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleEdit = async (record: HookSalaryRecord) => {
    try {
      // Load full record details for editing
      const fullRecord = await loadRecordDetails(record.id);
      if (fullRecord) {
        setEditRecord(fullRecord as DecryptedSalaryRecord);
      }
    } catch (error) {
      console.error('Failed to load record details for editing:', error);
    }
  };

  const handleDeleteSalary = async () => {
    if (!deleteRecord || !user) return;
    
    setIsDeleting(true);
    try {
      // Delete from local storage (which handles sync queue)
      await LocalStorageService.deleteCompensationRecord(deleteRecord.id!);
      
      // Track deletion analytics
      AnalyticsService.trackDataEvent({
        data_type: 'salary',
        action: 'delete',
      });
      
      // Invalidate session cache to ensure fresh data on next page load
      if (user?.id) {
        sessionDataCache.invalidateUser(user.id);
      }
      
      // Close dialog and refresh list
      setDeleteRecord(null);
      setRefreshTrigger(prev => prev + 1);
      
      console.log('Salary record deleted successfully');
    } catch (error) {
      console.error('Failed to delete salary record:', error);
      // Show error to user - for now using alert, could be replaced with toast system
      alert('Failed to delete salary record. Please try again.');
    } finally {
      setIsDeleting(false);
    }
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
          onEdit={handleEdit}
          onDelete={async (record) => {
            try {
              // Load full record details for deletion
              const fullRecord = await loadRecordDetails(record.id);
              if (fullRecord) {
                setDeleteRecord(fullRecord as DecryptedSalaryRecord);
              }
            } catch (error) {
              console.error('Failed to load record details for deletion:', error);
            }
          }}
        />

        <AddSalaryForm
          isOpen={showAddForm}
          onClose={() => setShowAddForm(false)}
          onSuccess={handleAddSuccess}
        />

        <AddSalaryForm
          isOpen={!!editRecord}
          onClose={() => setEditRecord(null)}
          onSuccess={handleEditSuccess}
          editRecord={editRecord || undefined}
        />

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteRecord} onOpenChange={() => setDeleteRecord(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Salary Record</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this salary record? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {deleteRecord && (
              <div className="py-4">
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Company:</span> {deleteRecord.decryptedData.company || 'N/A'}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Title:</span> {deleteRecord.decryptedData.title || 'N/A'}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Amount:</span> {deleteRecord.decryptedData.currency} {deleteRecord.decryptedData.amount?.toLocaleString() || 'N/A'}
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteRecord(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteSalary}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}