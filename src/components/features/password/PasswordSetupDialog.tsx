'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Shield, Lock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { usePasswordAuth, usePasswordValidation } from '@/hooks/usePassword';
import { cn } from '@/lib/utils';

interface PasswordSetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

export function PasswordSetupDialog({ 
  isOpen, 
  onClose, 
  title = "Set Up Master Password",
  description = "Create a secure master password to encrypt your compensation data. This password will be used to protect all your sensitive information."
}: PasswordSetupDialogProps) {
  const { handleSetupPassword, isLoading, error, clearError } = usePasswordAuth();
  const { password, validation, updatePassword, generatePassword, clearPassword } = usePasswordValidation();
  
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updatePassword(e.target.value);
    if (error) clearError();
  }, [updatePassword, error, clearError]);

  const handleConfirmPasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    if (error) clearError();
  }, [error, clearError]);

  const handleGeneratePassword = useCallback(() => {
    const generated = generatePassword(16);
    setConfirmPassword(generated);
  }, [generatePassword]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validation.isValid) {
      return;
    }

    if (password !== confirmPassword) {
      return;
    }

    if (!agreedToTerms) {
      return;
    }

    const result = await handleSetupPassword(password);
    if (result.success) {
      clearPassword();
      setConfirmPassword('');
      setAgreedToTerms(false);
      onClose();
    }
  }, [password, confirmPassword, validation.isValid, agreedToTerms, handleSetupPassword, clearPassword, onClose]);

  const handleCancel = useCallback(() => {
    clearPassword();
    setConfirmPassword('');
    setAgreedToTerms(false);
    clearError();
    onClose();
  }, [clearPassword, clearError, onClose]);

  const passwordsMatch = password === confirmPassword;
  const canSubmit = validation.isValid && passwordsMatch && agreedToTerms && password.length > 0;

  const getStrengthColor = (strength: string) => {
    switch (strength) {
      case 'weak': return 'text-red-500';
      case 'fair': return 'text-yellow-500';
      case 'good': return 'text-blue-500';
      case 'strong': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  const getStrengthProgress = (strength: string) => {
    switch (strength) {
      case 'weak': return 25;
      case 'fair': return 50;
      case 'good': return 75;
      case 'strong': return 100;
      default: return 0;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <Shield className="w-6 h-6 text-blue-600" />
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription className="text-sm text-gray-600">
            {description}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Password Input */}
            <div className="space-y-2">
              <Label htmlFor="password">Master Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="Enter your master password"
                  className={cn(
                    "pr-10",
                    !validation.isValid && password.length > 0 && "border-red-500"
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              
              {/* Password Strength Indicator */}
              {password.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Password Strength:</span>
                    <Badge 
                      variant="outline" 
                      className={getStrengthColor(validation.strength)}
                    >
                      {validation.strength.toUpperCase()}
                    </Badge>
                  </div>
                  <Progress 
                    value={getStrengthProgress(validation.strength)} 
                    className="h-2"
                  />
                  
                  {/* Validation Feedback */}
                  <div className="space-y-1">
                    {validation.feedback.map((feedback, index) => (
                      <div key={index} className="flex items-center space-x-2 text-sm">
                        {validation.isValid ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className={validation.isValid ? 'text-green-700' : 'text-red-700'}>
                          {feedback}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password Input */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  placeholder="Confirm your master password"
                  className={cn(
                    "pr-10",
                    confirmPassword.length > 0 && !passwordsMatch && "border-red-500"
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              
              {/* Password Match Indicator */}
              {confirmPassword.length > 0 && (
                <div className="flex items-center space-x-2 text-sm">
                  {passwordsMatch ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-green-700">Passwords match</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-500" />
                      <span className="text-red-700">Passwords do not match</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Generate Password Button */}
            <Button
              type="button"
              variant="outline"
              onClick={handleGeneratePassword}
              className="w-full"
            >
              <Lock className="w-4 h-4 mr-2" />
              Generate Secure Password
            </Button>

            {/* Terms Agreement */}
            <div className="flex items-start space-x-2">
              <input
                type="checkbox"
                id="terms"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-1"
              />
              <Label htmlFor="terms" className="text-sm text-gray-600 cursor-pointer">
                I understand that this password encrypts my data and cannot be recovered if lost. 
                I will keep it secure and backed up.
              </Label>
            </div>

            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit || isLoading}
                className="flex-1"
              >
                {isLoading ? 'Setting up...' : 'Set Up Password'}
              </Button>
            </div>
          </form>

          {/* Security Notice */}
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-start space-x-2">
              <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">Security Notice:</p>
                <p>Your password is used to encrypt your data locally. It is never sent to our servers and cannot be recovered if lost.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default PasswordSetupDialog;