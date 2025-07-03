import { z } from 'zod';

export const bonusSchema = z.object({
  company: z.string().min(1, 'Company is required'),
  type: z.enum(['performance', 'signing', 'retention', 'spot', 'annual', 'other'], {
    required_error: 'Bonus type is required',
  }),
  amount: z.number().min(0, 'Amount must be positive'),
  currency: z.string().min(1, 'Currency is required'),
  date: z.string().min(1, 'Bonus date is required'),
  payrollDate: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  notes: z.string().optional(),
});

export type BonusFormData = z.infer<typeof bonusSchema>;

export const bonusTypeOptions = [
  { value: 'performance', label: 'Performance Bonus' },
  { value: 'signing', label: 'Signing Bonus' },
  { value: 'retention', label: 'Retention Bonus' },
  { value: 'spot', label: 'Spot Bonus' },
  { value: 'annual', label: 'Annual Bonus' },
  { value: 'other', label: 'Other' },
] as const;

export const currencyOptions = [
  { value: 'USD', label: '$' },
  { value: 'EUR', label: '€' },
  { value: 'GBP', label: '£' },
  { value: 'CAD', label: 'C$' },
  { value: 'AUD', label: 'A$' },
  { value: 'JPY', label: '¥' },
  { value: 'CHF', label: 'CHF' },
  { value: 'SEK', label: 'SEK' },
  { value: 'NOK', label: 'NOK' },
  { value: 'DKK', label: 'DKK' },
];