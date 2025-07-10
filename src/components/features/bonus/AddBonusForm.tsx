'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Controller } from 'react-hook-form';
import { FormItem, FormControl, FormMessage } from '@/components/ui/form-field';
import { FormLabel } from '@/components/ui/form-label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { bonusSchema, type BonusFormData, bonusTypeOptions, currencyOptions } from '@/lib/validations/bonus';
import { useAuth } from '@/contexts/AuthContext';
import { useSecurePassword } from '@/hooks/usePassword';
import { EncryptionService } from '@/services/encryptionService';
import { LocalStorageService } from '@/services/localStorageService';
import { format } from 'date-fns';

interface AddBonusFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddBonusForm({ isOpen, onClose, onSuccess }: AddBonusFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const getPassword = useSecurePassword;
  
  const form = useForm<BonusFormData>({
    resolver: zodResolver(bonusSchema),
    defaultValues: {
      company: '',
      type: 'performance',
      amount: 0,
      currency: 'USD',
      date: format(new Date(), 'yyyy-MM-dd'),
      payrollDate: '',
      description: '',
      notes: '',
    },
  });

  const onSubmit = async (data: BonusFormData) => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      // Get user's master password from secure context
      const userPassword = getPassword();
      if (!userPassword) {
        alert('Please authenticate to continue');
        return;
      }
      
      // Encrypt the sensitive data
      const encryptedData = await EncryptionService.encryptData(JSON.stringify(data), userPassword);
      
      // Store locally first (local-first architecture)
      await LocalStorageService.addCompensationRecord({
        userId: user.id,
        type: 'bonus',
        encryptedData,
        currency: data.currency,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        syncStatus: 'pending',
        version: 1,
      });

      onSuccess();
      onClose();
      form.reset();
    } catch (error) {
      console.error('Error saving bonus:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add New Bonus</DialogTitle>
          <DialogDescription>
            Record bonus information including amount, type, and payment details.
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
              name="type"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Bonus Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select bonus type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {bonusTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
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
              name="amount"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Bonus Amount</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="10000"
                      {...field}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.onChange(Number(e.currentTarget!.value))}
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
              name="date"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Bonus Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                </FormItem>
              )}
            />

            <Controller
              control={form.control}
              name="payrollDate"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Payroll Date (optional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                </FormItem>
              )}
            />
          </div>

          <Controller
            control={form.control}
            name="description"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Q4 2024 Performance Bonus" {...field} />
                </FormControl>
                {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
              </FormItem>
            )}
          />

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
              {isLoading ? 'Saving...' : 'Save Bonus'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}