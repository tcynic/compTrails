import { z } from 'zod';

export const equitySchema = z.object({
  company: z.string().min(1, 'Company is required'),
  type: z.enum(['ISO', 'NSO', 'RSU', 'ESPP', 'other'], {
    required_error: 'Equity type is required',
  }),
  shares: z.number().min(1, 'Number of shares must be at least 1'),
  strikePrice: z.number().min(0, 'Strike price must be positive').optional(),
  grantDate: z.string().min(1, 'Grant date is required'),
  vestingStart: z.string().min(1, 'Vesting start date is required'),
  vestingCliff: z.number().min(0, 'Vesting cliff must be positive').optional(),
  vestingPeriod: z.number().min(1, 'Vesting period must be at least 1 month'),
  vestingFrequency: z.enum(['monthly', 'quarterly', 'annual'], {
    required_error: 'Vesting frequency is required',
  }),
  notes: z.string().optional(),
});

export type EquityFormData = z.infer<typeof equitySchema>;

export const equityTypeOptions = [
  { value: 'ISO', label: 'ISO (Incentive Stock Options)' },
  { value: 'NSO', label: 'NSO (Non-Qualified Stock Options)' },
  { value: 'RSU', label: 'RSU (Restricted Stock Units)' },
  { value: 'ESPP', label: 'ESPP (Employee Stock Purchase Plan)' },
  { value: 'other', label: 'Other' },
] as const;

export const vestingFrequencyOptions = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
] as const;

export const vestingPeriodOptions = [
  { value: 12, label: '12 months (1 year)' },
  { value: 24, label: '24 months (2 years)' },
  { value: 36, label: '36 months (3 years)' },
  { value: 48, label: '48 months (4 years)' },
] as const;

export const vestingCliffOptions = [
  { value: 0, label: 'No cliff' },
  { value: 6, label: '6 months' },
  { value: 12, label: '12 months (1 year)' },
  { value: 18, label: '18 months' },
  { value: 24, label: '24 months (2 years)' },
] as const;