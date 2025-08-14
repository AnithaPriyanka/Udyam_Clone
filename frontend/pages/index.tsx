import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import FormField, { FieldSchema } from '../components/FormField';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:5000';

type Errors = Record<string, string | undefined>;
type Values = Record<string, any>;

function regexTest(pattern?: string, value?: string) {
  if (!pattern || value == null) return true;
  try { 
    return new RegExp(pattern).test(String(value)); 
  } catch { 
    return true; 
  }
}

function aadhaarValid(v: string) {
  return /^\d{12}$/.test(v || '');
}

// In-memory store for Aadhaar verification status (for demonstration purposes)
const aadhaarVerificationStatus: Record<string, boolean> = {};

function panValid(v: string) {
  return /^[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}$/.test(v || '');
}

export default function IndexPage() {
  const [schema, setSchema] = useState<FieldSchema[]>([]);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Errors>({});
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitMsg, setSubmitMsg] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [aadhaarVerified, setAadhaarVerified] = useState<boolean>(false);
  const [showOtpInput, setShowOtpInput] = useState<boolean>(false);

  // Define the schema for the first two steps locally
  const initialSchema: FieldSchema[] = [
    {
      name: 'aadhaarNumber',
      label: 'Aadhaar Number',
      step: 1,
      type: 'text',
      placeholder: 'Enter your 12-digit Aadhaar number',
      required: true,
      validation: {
        pattern: '^\\d{12}$',
        message: 'Aadhaar number must be 12 digits long.'
      }
    },
    {
      name: 'udyamNumber',
      label: 'Udyam Registration Number',
      step: 1,
      type: 'text',
      placeholder: 'Enter your Udyam Registration Number',
      required: false,
    },
    { "name": "otp", "label": "OTP", "step": 2, "type": "text", "placeholder": "Enter the OTP received", "required": true, "validation": { "pattern": "^\\d{6}$", "message": "OTP must be 6 digits long." } },
    {
      name: 'pan',
      label: 'PAN Number',
      step: 3,
      type: 'text',
      placeholder: 'Enter your PAN number',
      required: true,
      validation: {
        pattern: '^[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}$',
        message: 'PAN must be 10 characters long and follow the format ABCDE1234F.'
      }
    }
  ];

  useEffect(() => {
    setSchema(initialSchema);
    setLoading(false);
  }, []);

  const step1Fields = useMemo(() => schema.filter(f => f.step === 1), [schema]);
  const step2Fields = useMemo(() => schema.filter(f => f.step === 2), [schema]);
  const step3Fields = useMemo(() => schema.filter(f => f.step === 3), [schema]);

  const setValue = (name: string, value: any) => {
    setValues(v => ({ ...v, [name]: value }));
    validateField(name, value);
  };

  // Live validation function
  const validateField = (name: string, value: any) => {
    const field = initialSchema.find(f => f.name === name);
    if (!field) return;
    let err: string | undefined;

    // Required
    if (field.required && (value == null || String(value).trim() === '')) {
      err = 'This field is required';
    }

    // Regex/length
    if (!err && field.validation) {
      const { pattern, minLength, maxLength, message } = field.validation;
      if (typeof minLength === 'number' && String(value || '').length < minLength) err = message || `Minimum length is ${minLength}`;
      if (!err && typeof maxLength === 'number' && String(value || '').length > maxLength) err = message || `Maximum length is ${maxLength}`;
      if (!err && pattern && !regexTest(pattern, value)) err = message || 'Invalid format';
    }

    // Special heuristics
    const label = (field.label || field.name).toLowerCase();
    if (!err && (/aadhaar|aadhar/.test(label) || /^aadhaar/i.test(field.name))) {
      if (!aadhaarValid(String(value || ''))) {
        err = 'Aadhaar must be exactly 12 digits';
      } else if (!aadhaarVerificationStatus[String(value || '')]) {
        err = 'Aadhaar must be verified with OTP';
      }
    }
    if (!err && (/\bpan\b/.test(label) || /^pan/i.test(field.name))) {
      if (!panValid(String(value || ''))) err = 'PAN must match ABCDE1234F';
    }

    setErrors(e => ({ ...e, [name]: err }));
  };

  // Step change
  const validateStep = (fields: FieldSchema[]) => {
    let ok = true;
    const newErrors: Errors = {};
    for (const f of fields) {
      const val = values[f.name];
      let err: string | undefined;
      if (f.required && (val == null || String(val).trim() === '')) err = 'This field is required';
      if (!err && f.validation?.pattern && !regexTest(f.validation.pattern, String(val || ''))) err = f.validation.message || 'Invalid format';
      const label = (f.label || f.name).toLowerCase();
      if (!err && (/aadhaar|aadhar/.test(label) || /^aadhaar/i.test(f.name))) {
        if (!aadhaarValid(String(val || ''))) err = 'Aadhaar must be exactly 12 digits';
      }
      if (!err && (/pan/i.test(label) || /^pan/i.test(f.name))) {
        if (!panValid(String(val || ''))) err = 'PAN must match ABCDE1234F';
      }

      if (err) ok = false;
      newErrors[f.name] = err;
    }
    setErrors(e => ({ ...e, ...newErrors }));
    return ok;
  };

  // PostPin integration: debounce 500ms
  useEffect(() => {
    const pinName = schema.find(f => f.name.toLowerCase().includes('pin'))?.name || 'pinCode';
    const cityName = schema.find(f => (f.label || f.name).toLowerCase().includes('city'))?.name || 'city';
    const stateName = schema.find(f => (f.label || f.name).toLowerCase().includes('state'))?.name || 'state';
    const pin = values[pinName];
    
    if (!pin || !/^\d{6}$/.test(String(pin))) return;
    
    const t = setTimeout(async () => {
      try {
        const resp = await axios.get(`https://api.postalpincode.in/pincode/${pin}`);
        const data = resp.data?.[0];
        const po = data?.PostOffice?.[0];
        if (po) {
          setValues(v => ({ ...v, [cityName]: po.District || v[cityName], [stateName]: po.State || v[stateName] }));
        }
      } catch {
        // ignore
      }
    }, 500);
    
    return () => clearTimeout(t);
  }, [values, schema]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitMsg('');

    if (currentStep === 1) {
      // Aadhaar verification step
      const aadhaarNumber = values['aadhaarNumber'];
      if (!aadhaarValid(aadhaarNumber)) {
        setErrors(e => ({ ...e, aadhaarNumber: 'Invalid Aadhaar number.' }));
        setSubmitMsg('Please enter a valid 12-digit Aadhaar number.');
        return;
      }

      // Call backend to generate OTP
      setLoading(true);
      try {
        const response = await axios.post(`${BACKEND_URL}/api/generate-otp`, {
          aadhaarNumber: aadhaarNumber,
        });

        if (response.data.message === 'OTP sent successfully') {
          setAadhaarVerified(true);
          setShowOtpInput(true); // Show OTP input after successful OTP generation
          setSubmitMsg('OTP sent successfully. Please enter the OTP received.');
          setCurrentStep(2); // Move to step 2 for OTP verification
        } else {
          setSubmitMsg(response.data.error || 'Failed to send OTP. Please try again.');
        }
      } catch (error: any) {
        setSubmitMsg(error.response?.data?.error || 'Server error. Failed to send OTP.');
      } finally {
        setLoading(false);
      }
    } else if (currentStep === 2) {
      // OTP validation step
      const otpValue = values['otp'];
      if (!otpValue || !/^\d{6}$/.test(otpValue)) {
        setErrors(e => ({ ...e, otp: 'OTP must be 6 digits long.' }));
        setSubmitMsg('Please enter a valid 6-digit OTP.');
        return;
      }
      
      setLoading(true);
      try {
        const response = await axios.post(`${BACKEND_URL}/api/verify-otp`, {
          aadhaarNumber: values['aadhaarNumber'],
          otp: otpValue,
        });

        if (response.data.message === 'OTP verified successfully') {
          aadhaarVerificationStatus[values['aadhaarNumber']] = true; // Mark as verified
          setAadhaarVerified(true); // Mark Aadhaar as verified on frontend
          setShowOtpInput(false); // Hide OTP input after successful verification
          setSubmitMsg('OTP verified successfully. Proceeding to PAN validation.');
          setCurrentStep(3); // Move to the PAN step after OTP verification
        } else {
          setSubmitMsg('OTP verification failed: ' + (response.data.error || 'Invalid OTP'));
        }
      } catch (error: any) {
        setSubmitMsg('OTP verification failed: ' + (error.response?.data?.error || 'Server error'));
      } finally {
        setLoading(false);
      }
    } else if (currentStep === 3) {
      // PAN validation and form submission step
      const panNumber = values['pan'];
      if (!panValid(panNumber)) {
        setErrors(e => ({ ...e, pan: 'Invalid PAN number format.' }));
        setSubmitMsg('Please enter a valid PAN number.');
        return;
      }

      setLoading(true);
      try {
        const submitResponse = await axios.post(`${BACKEND_URL}/api/submit`, {
          aadhaar: values['aadhaarNumber'],
          pan: panNumber,
          ...values, // Include all form values
        });

        if (submitResponse.data.success) {
          setSubmitMsg('Form submitted successfully!');
          setCurrentStep(4); // Move to a success step or clear form
        } else {
          setSubmitMsg(`Form submission failed: ${submitResponse.data.message || 'Unknown error'}`);
        }
      } catch (error: any) {
        setSubmitMsg(error.response?.data?.error || 'Server error. Failed to submit form.');
      } finally {
        setLoading(false);
      }
    }
  };

  if (loading) return <div className="p-4">Loading...</div>;

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
        <div className="text-center mb-6">
          <img src="/images/udyam.png" alt="Emblem of India" className="mx-auto h-20 w-auto" />
          <h2 className="mt-4 text-2xl font-bold text-gray-900">UDYAM REGISTRATION</h2>
          <p className="mt-2 text-sm text-gray-600">Ministry of Micro, Small and Medium Enterprises</p>
          <p className="text-sm text-gray-600">Government of India</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {currentStep === 1 && !showOtpInput && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-gray-800">For New Entrepreneurs who are not Registered Yet as MSME</h3>
              <p className="text-sm text-gray-600">Choose one of the options below to register:</p>

              <div className="border p-4 rounded-md">
                <h4 className="font-medium text-gray-700 mb-2">Option 1: For those having Aadhaar Number</h4>
                {step1Fields.filter(f => f.name === 'aadhaarNumber').map(field => (
                  <FormField
                    key={field.name}
                    field={field}
                    value={values[field.name]}
                    onChange={setValue}
                    error={errors[field.name]}
                  />
                ))}
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-4 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {loading ? 'Validating...' : 'Validate & Generate OTP'}
                </button>
              </div>

              <div className="border p-4 rounded-md">
                <h4 className="font-medium text-gray-700 mb-2">Option 2: For those already having Udyam Registration Number</h4>
                <p className="text-sm text-gray-600">Login with your Udyam Registration Number</p>
                <FormField
                  field={{ name: 'udyamNumber', label: 'Udyam Registration Number', type: 'text', placeholder: 'Enter your Udyam Registration Number' }}
                  value={values['udyamNumber']}
                  onChange={setValue}
                  error={errors['udyamNumber']}
                />
                <button
                  type="button"
                  disabled={loading}
                  className="mt-4 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
                >
                  Login with Udyam Number
                </button>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4 mt-6">
              <h3 className="text-xl font-semibold text-gray-800">OTP Verification</h3>
              <p className="text-sm text-gray-600">Enter the 6-digit OTP sent to your registered mobile number</p>
              {step2Fields.map(field => (
                <FormField
                  key={field.name}
                  field={field}
                  value={values[field.name]}
                  onChange={setValue}
                  error={errors[field.name]}
                />
              ))}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-gray-800">PAN Validation</h3>
              <p className="text-sm text-gray-600">Enter your PAN number for validation</p>
              {step3Fields.map(field => (
                <FormField
                  key={field.name}
                  field={field}
                  value={values[field.name]}
                  onChange={setValue}
                  error={errors[field.name]}
                />
              ))}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? 'Submitting...' : 'Validate PAN & Submit'}
              </button>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-green-800">Registration Complete!</h3>
              <p className="text-sm text-gray-600">Your UDYAM registration has been submitted successfully.</p>
              <button
                type="button"
                onClick={() => {
                  setCurrentStep(1);
                  setValues({});
                  setErrors({});
                  setSubmitMsg('');
                  setShowOtpInput(false);
                  setAadhaarVerified(false);
                }}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Start New Registration
              </button>
            </div>
          )}

          {submitMsg && (
            <p className={`text-center text-sm ${submitMsg.includes('successfully') ? 'text-green-600' : 'text-red-600'}`}>
              {submitMsg}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}