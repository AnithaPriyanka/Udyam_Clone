import { prisma } from '../models/prismaClient.js';
import crypto from 'crypto';
import { validateAadhaar } from './validation.js';

function validatePan(pan) {
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(pan);
}

export async function getSchema(req, res) {
  // For this clone, we are not providing a dynamic schema from the backend.
  // The frontend has a hardcoded schema for Aadhaar and OTP.
  // This function can be expanded later to serve dynamic schemas if needed.
  return res.status(200).json({});
}

const otpStore = {}; // In-memory store for OTPs (for demonstration purposes)

export async function submitForm(req, res) {
  try {
    const payload = req.body || {};

    const { aadhaar, pan } = payload;

    if (!aadhaar || !validateAadhaar(aadhaar)) {
      return res.status(400).json({ error: 'Invalid Aadhaar number' });
    }

    if (!pan || !validatePan(pan)) {
      return res.status(400).json({ error: 'Invalid PAN number format' });
    }

    // For this clone, we are not validating against a backend schema
    // and assume the frontend handles the initial Aadhaar/OTP flow.
    // The submitForm function will simply store the payload.

    const record = await prisma.submission.create({
      data: {
        aadhaar: aadhaar,
        pan: pan,
        payload
      }
    });

    console.log(`Form submitted successfully with ID: ${record.id}`);
    return res.status(200).json({ success: true, id: record.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export async function generateOtp(req, res) {
  const { aadhaarNumber } = req.body;

  console.log('Received generateOtp request for Aadhaar:', aadhaarNumber);
  if (!aadhaarNumber) {
    console.log('Aadhaar number is missing.');
    return res.status(400).json({ error: 'Aadhaar number is required' });
  }

  if (!validateAadhaar(aadhaarNumber)) {
    console.log('Aadhaar number validation failed for:', aadhaarNumber);
    return res.status(400).json({ error: 'Invalid Aadhaar number format' });
  }

  const otp = crypto.randomInt(100000, 999999).toString();
  const expiry = Date.now() + 5 * 60 * 1000; // OTP valid for 5 minutes

  otpStore[aadhaarNumber] = { otp, expiry };

  console.log(`OTP generated for Aadhaar ${aadhaarNumber}: ${otp}`); // Log OTP for demonstration
  console.log(`OTP generated for Aadhaar ${aadhaarNumber}: ${otp}`); // Log OTP for demonstration

  return res.status(200).json({ message: 'OTP sent successfully' });
}

export async function verifyOtp(req, res) {
  const { aadhaarNumber, otp } = req.body;

  if (!aadhaarNumber || !validateAadhaar(aadhaarNumber)) {
    return res.status(400).json({ error: 'Invalid Aadhaar number' });
  }

  if (!otp) {
    return res.status(400).json({ error: 'OTP is required' });
  }

  const storedOtp = otpStore[aadhaarNumber];

  if (!storedOtp) {
    return res.status(400).json({ error: 'No OTP generated for this Aadhaar number' });
  }

  if (Date.now() > storedOtp.expiry) {
    delete otpStore[aadhaarNumber]; // Clear expired OTP
    return res.status(400).json({ error: 'OTP expired' });
  }

  if (otp === storedOtp.otp) {
    otpStore[aadhaarNumber].verified = true; // Mark as verified
    otpStore[aadhaarNumber].otp = null; // Clear OTP value
    otpStore[aadhaarNumber].expiry = null; // Clear expiry
    return res.status(200).json({ message: 'OTP verified successfully' });
  } else {
    return res.status(400).json({ error: 'Invalid OTP' });
  }
}
