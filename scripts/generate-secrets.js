#!/usr/bin/env node
/**
 * Production Environment Setup Script
 * Generates secure random secrets for production deployment
 */

const crypto = require('crypto');

console.log('\n🔐 PRODUCTION SECRETS GENERATOR\n');
console.log('Copy these values to your production .env file:\n');
console.log('─'.repeat(60));

// Generate SESSION_SECRET
const sessionSecret = crypto.randomBytes(32).toString('hex');
console.log(`\nSESSION_SECRET=${sessionSecret}`);

// Generate RAZORPAY_WEBHOOK_SECRET  
const webhookSecret = crypto.randomBytes(32).toString('hex');
console.log(`RAZORPAY_WEBHOOK_SECRET=${webhookSecret}`);

// Generate ADMIN_PASS (strong password)
const adminPass = crypto.randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '') + '@2026!';
console.log(`ADMIN_PASS=${adminPass}`);

console.log('\n' + '─'.repeat(60));
console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
console.log('1. Never commit these secrets to git');
console.log('2. Store them securely (password manager, vault)');
console.log('3. Rotate secrets regularly (every 90 days)');
console.log('4. Use different secrets for dev/staging/production\n');
