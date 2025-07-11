'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Controller } from 'react-hook-form';
import { FormItem, FormControl, FormMessage } from '@/components/ui/form-field';
import { FormLabel } from '@/components/ui/form-label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { salarySchema, type SalaryFormData, currencyOptions } from '@/lib/validations/salary';
import { useAuth } from '@/contexts/AuthContext';
import { useSecurePassword } from '@/hooks/usePassword';
import { EncryptionService } from '@/services/encryptionService';
import { LocalStorageService } from '@/services/localStorageService';
import { format } from 'date-fns';
import type { DecryptedSalaryData, CompensationRecord } from '@/lib/db/types';

interface DecryptedSalaryRecord extends CompensationRecord {
  decryptedData: DecryptedSalaryData;
}

interface AddSalaryFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editRecord?: DecryptedSalaryRecord; // Optional record to edit
}

export function AddSalaryForm({ isOpen, onClose, onSuccess, editRecord }: AddSalaryFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const password = useSecurePassword();
  
  // Determine if we're in edit mode
  const isEditMode = !!editRecord;
  
  const form = useForm<SalaryFormData>({
    resolver: zodResolver(salarySchema),
    defaultValues: {
      company: '',
      title: '',
      location: '',
      amount: 0,
      currency: 'USD',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: '',
      isCurrentPosition: true,
      notes: '',
    },
  });

  // Pre-populate form when editing
  React.useEffect(() => {
    if (editRecord && isOpen) {
      const data = editRecord.decryptedData;
      form.reset({
        company: data.company,
        title: data.title,
        location: data.location,
        amount: data.amount,
        currency: data.currency,
        startDate: data.startDate,
        endDate: data.endDate || '',
        isCurrentPosition: data.isCurrentPosition,
        notes: data.notes || '',
      });
    } else if (!editRecord && isOpen) {
      // Reset to default values when opening in add mode
      form.reset({
        company: '',
        title: '',
        location: '',
        amount: 0,
        currency: 'USD',
        startDate: format(new Date(), 'yyyy-MM-dd'),
        endDate: '',
        isCurrentPosition: true,
        notes: '',
      });
    }
  }, [editRecord, isOpen, form]);

  const onSubmit = async (data: SalaryFormData) => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      // Get user's master password from secure context
      if (!password) {
        alert('Please authenticate to continue');
        return;
      }
      
      // Encrypt the sensitive data
      const encryptedData = await EncryptionService.encryptData(JSON.stringify(data), password);
      
      if (isEditMode && editRecord) {
        // Update existing record
        await LocalStorageService.updateCompensationRecord(editRecord.id!, {
          encryptedData,
          currency: data.currency,
          updatedAt: Date.now(),
          version: editRecord.version + 1,
        });
      } else {
        // Create new record - Store locally first (local-first architecture)
        await LocalStorageService.addCompensationRecord({
          userId: user.id,
          type: 'salary',
          encryptedData,
          currency: data.currency,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          syncStatus: 'pending',
          version: 1,
        });
      }

      onSuccess();
      onClose();
      form.reset();
    } catch (error) {
      console.error(`Error ${isEditMode ? 'updating' : 'saving'} salary:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Salary' : 'Add New Salary'}</DialogTitle>
          <DialogDescription>
            {isEditMode 
              ? 'Update your salary information including base pay, currency, and effective dates.'
              : 'Record your salary information including base pay, currency, and effective dates.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={form.control}
              name="company"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Company</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Google Inc." {...field} />
                  </FormControl>
                  {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                </FormItem>
              )}
            />
            
            <Controller
              control={form.control}
              name="title"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Job Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Software Engineer" {...field} />
                  </FormControl>
                  {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                </FormItem>
              )}
            />
          </div>

          <Controller
            control={form.control}
            name="location"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., San Francisco, CA" {...field} />
                </FormControl>
                {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={form.control}
              name="amount"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Annual Salary</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="150000"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.currentTarget!.value))}
                    />
                  </FormControl>
                  {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                </FormItem>
              )}
            />

            <Controller
              control={form.control}
              name="currency"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Currency</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {currencyOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label} {option.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={form.control}
              name="startDate"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                </FormItem>
              )}
            />

            <Controller
              control={form.control}
              name="endDate"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>End Date (optional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                </FormItem>
              )}
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isCurrentPosition"
              {...form.register('isCurrentPosition')}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <FormLabel htmlFor="isCurrentPosition">This is my current position</FormLabel>
          </div>

          <Controller
            control={form.control}
            name="notes"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>Notes (optional)</FormLabel>
                <FormControl>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Any additional notes..."
                    {...field}
                  />
                </FormControl>
                {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading 
                ? (isEditMode ? 'Updating...' : 'Saving...') 
                : (isEditMode ? 'Update Salary' : 'Save Salary')
              }
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}