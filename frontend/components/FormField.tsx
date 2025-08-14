import React from 'react';

export type FieldSchema = {
  name: string;
  id?: string | null;
  label: string;
  step: number;
  type: string;
  placeholder?: string | null;
  required?: boolean;
  validation?: {
    pattern?: string;
    message?: string;
    minLength?: number | null;
    maxLength?: number | null;
  } | null;
  options?: { value: string; label: string }[] | null;
  visible?: boolean;
};

type Props = {
  field: FieldSchema;
  value: any;
  error?: string;
  onChange: (name: string, value: any) => void;
};

const FormField: React.FC<Props> = ({ field, value, error, onChange }) => {
  if (field.visible === false) return null;
  const common = {
    id: field.id || field.name,
    name: field.name,
    placeholder: field.placeholder || undefined,
    value: value ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(field.name, e.target.value),
    'aria-invalid': !!error,
    'aria-describedby': error ? `${field.name}-error` : undefined,
    className: `border ${error ? 'border-red-500' : 'border-gray-300'} rounded-md px-3 py-2 w-full`
  };

  return (
    <div className="mb-4">
      <label htmlFor={common.id} className="block mb-1 font-medium">
        {field.label}{field.required ? ' *' : ''}
      </label>
      {field.type === 'select' && field.options ? (
        <select {...common as any}>
          {field.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea {...common as any} rows={3} />
      ) : (
        <input type={field.type || 'text'} {...common as any} />
      )}
      {error && <div id={`${field.name}-error`} className="error-text">{error}</div>}
    </div>
  );
};

export default FormField;
