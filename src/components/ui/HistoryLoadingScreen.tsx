'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Shield, Database, Unlock } from 'lucide-react';

interface HistoryLoadingScreenProps {
  message?: string;
  showProgress?: boolean;
  progress?: number;
  stage?: 'querying' | 'decrypting' | 'processing' | 'complete';
}

const stages = {
  querying: {
    icon: Database,
    message: 'Loading your compensation records...',
    description: 'Accessing local database'
  },
  decrypting: {
    icon: Unlock,
    message: 'Decrypting your data...',
    description: 'Ensuring your privacy with client-side decryption'
  },
  processing: {
    icon: Shield,
    message: 'Processing your compensation history...',
    description: 'Organizing your financial data securely'
  },
  complete: {
    icon: Shield,
    message: 'Almost ready...',
    description: 'Finalizing your dashboard'
  }
};

export function HistoryLoadingScreen({ 
  message,
  showProgress = false,
  progress = 0,
  stage = 'querying'
}: HistoryLoadingScreenProps) {
  const [dots, setDots] = useState('');
  const [currentStage, setCurrentStage] = useState(stage);
  
  // Animate dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    
    return () => clearInterval(interval);
  }, []);

  // Auto-progress through stages if no explicit stage provided
  useEffect(() => {
    if (stage === 'querying') {
      const timer1 = setTimeout(() => setCurrentStage('decrypting'), 800);
      const timer2 = setTimeout(() => setCurrentStage('processing'), 1600);
      
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [stage]);

  const StageIcon = stages[currentStage]?.icon || Shield;
  const stageInfo = stages[currentStage] || stages.complete;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-8 text-center">
          {/* Animated Icon */}
          <div className="relative mb-6">
            <div className="absolute inset-0 animate-ping">
              <div className="h-16 w-16 mx-auto rounded-full bg-blue-100"></div>
            </div>
            <div className="relative">
              <div className="h-16 w-16 mx-auto rounded-full bg-blue-500 flex items-center justify-center">
                <StageIcon className="h-8 w-8 text-white" />
              </div>
            </div>
          </div>

          {/* Main Loading Spinner */}
          <div className="mb-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
          </div>

          {/* Loading Message */}
          <div className="space-y-2 mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              {message || stageInfo.message}
              <span className="inline-block w-6 text-left">{dots}</span>
            </h3>
            <p className="text-sm text-gray-600">
              {stageInfo.description}
            </p>
          </div>

          {/* Progress Bar */}
          {showProgress && (
            <div className="mb-4">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {Math.round(progress)}% complete
              </p>
            </div>
          )}

          {/* Stage Indicators */}
          <div className="flex justify-center space-x-2 mt-6">
            {Object.entries(stages).map(([key, _], index) => (
              <div
                key={key}
                className={`h-2 w-2 rounded-full transition-colors duration-300 ${
                  Object.keys(stages).indexOf(currentStage) >= index
                    ? 'bg-blue-500'
                    : 'bg-gray-300'
                }`}
              />
            ))}
          </div>

          {/* Security Notice */}
          <div className="mt-6 p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center justify-center text-green-800 text-xs">
              <Shield className="h-3 w-3 mr-1" />
              <span>Your data is encrypted and processed locally for maximum privacy</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}