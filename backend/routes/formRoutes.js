import { Router } from 'express';
import { getSchema, submitForm, generateOtp, verifyOtp } from '../controllers/formController.js';

const router = Router();


router.post('/submit', submitForm);
router.post('/generate-otp', generateOtp);
router.post('/verify-otp', verifyOtp);

export default router;
