import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  // Hash the secret to ensure exactly 32 bytes for AES-256
  return crypto.createHash('sha256').update(secret).digest();
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  // Store IV alongside ciphertext: iv:encrypted
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encrypted: string): string {
  const key = getKey();
  const parts = encrypted.split(':');
  if (parts.length < 2) {
    // Fallback: if stored as plaintext (pre-encryption data), return as-is
    return encrypted;
  }
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts.slice(1).join(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
