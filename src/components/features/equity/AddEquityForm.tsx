'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Controller } from 'react-hook-form';
import { FormItem, FormControl, FormMessage } from '@/components/ui/form-field';
import { FormLabel } from '@/components/ui/form-label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  equitySchema, 
  type EquityFormData, 
  equityTypeOptions, 
  vestingFrequencyOptions, 
  vestingPeriodOptions,
  vestingCliffOptions
} from '@/lib/validations/equity';
import { useAuth } from '@/contexts/AuthContext';
import { useSecurePassword } from '@/hooks/usePassword';
import { EncryptionService } from '@/services/encryptionService';
import { LocalStorageService } from '@/services/localStorageService';
import { sessionDataCache } from '@/services/sessionDataCache';
import { format, addYears } from 'date-fns';

interface AddEquityFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddEquityForm({ isOpen, onClose, onSuccess }: AddEquityFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const password = useSecurePassword();
  
  const form = useForm<EquityFormData>({
    resolver: zodResolver(equitySchema),
    defaultValues: {
      company: '',
      type: 'ISO',
      shares: 0,
      strikePrice: undefined,
      grantDate: format(new Date(), 'yyyy-MM-dd'),
      vestingStart: format(addYears(new Date(), 1), 'yyyy-MM-dd'),
      vestingCliff: undefined,
      vestingPeriod: 48,
      vestingFrequency: 'monthly',
      notes: '',
    },
  });

  // Watch grant date changes to automatically update vesting start
  const watchedGrantDate = form.watch('grantDate');
  
  useEffect(() => {
    if (watchedGrantDate) {
      const grantDate = new Date(watchedGrantDate);
      const vestingStart = addYears(grantDate, 1);
      form.setValue('vestingStart', format(vestingStart, 'yyyy-MM-dd'));
    }
  }, [watchedGrantDate, form]);

  const onSubmit = async (data: EquityFormData) => {
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
      
      // Store locally first (local-first architecture)
      await LocalStorageService.addCompensationRecord({
        userId: user.id,
        type: 'equity',
        encryptedData,
        currency: 'USD', // Equity doesn't have currency, but we need something for the schema
        createdAt: Date.now(),
        updatedAt: Date.now(),
        syncStatus: 'pending',
        version: 1,
      });

      // Invalidate session cache to ensure fresh data on next page load
      sessionDataCache.invalidateUser(user.id);

      onSuccess();
      onClose();
      form.reset();
    } catch (error) {
      console.error('Error saving equity grant:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedType = form.watch('type');
  const needsStrikePrice = selectedType === 'ISO' || selectedType === 'NSO';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add New Equity Grant</DialogTitle>
          <DialogDescription>
            Record a new equity grant including shares, vesting schedule, and other compensation details.
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
                  <FormLabel>Equity Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select equity type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {equityTypeOptions.map((option) => (
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
              name="shares"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Number of Shares</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="1000"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.currentTarget!.value))}
                    />
                  </FormControl>
                  {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                </FormItem>
              )}
            />

            {needsStrikePrice && (
              <Controller
                control={form.control}
                name="strikePrice"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Strike Price (USD)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="10.00"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.currentTarget!.value))}
                      />
                    </FormControl>
                    {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                  </FormItem>
                )}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={form.control}
              name="grantDate"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Grant Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                </FormItem>
              )}
            />

            <Controller
              control={form.control}
              name="vestingStart"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Vesting Start Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={form.control}
              name="vestingPeriod"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Vesting Period</FormLabel>
                  <Select onValueChange={(value) => field.onChange(Number(value))} defaultValue={field.value.toString()}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select vesting period" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {vestingPeriodOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value.toString()}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                </FormItem>
              )}
            />

            <Controller
              control={form.control}
              name="vestingFrequency"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Vesting Frequency</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select vesting frequency" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {vestingFrequencyOptions.map((option) => (
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

          <Controller
            control={form.control}
            name="vestingCliff"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>Vesting Cliff (optional)</FormLabel>
                <Select onValueChange={(value) => field.onChange(value === '0' ? undefined : Number(value))} defaultValue={field.value?.toString() || '0'}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vesting cliff" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {vestingCliffOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value.toString()}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    placeholder="Any additional notes about this equity grant..."
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
              {isLoading ? 'Saving...' : 'Save Equity Grant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}