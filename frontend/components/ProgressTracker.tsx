import React from 'react';

type Props = {
  currentStep: number;
  totalSteps: number;
};

const ProgressTracker: React.FC<Props> = ({ currentStep, totalSteps }) => {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <div className="flex justify-between items-center mb-6">
      {steps.map(step => (
        <div key={step} className="flex flex-col items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${currentStep >= step ? 'bg-indigo-600' : 'bg-gray-400'}`}
          >
            {step}
          </div>
          {step < totalSteps && (
            <div
              className={`flex-1 h-1 w-16 ${currentStep > step ? 'bg-indigo-600' : 'bg-gray-400'}`}
            ></div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ProgressTracker;
