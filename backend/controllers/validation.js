export const validateAadhaar = (value) => {
  return /^\d{12}$/.test(value);
};