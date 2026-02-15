// AES-256-GCM encryption for auth credentials at rest
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;
const TAG_LEN = 16;

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    // Generate a deterministic key from a machine-specific seed so existing data isn't lost on restart
    // In production, set ENCRYPTION_KEY env var (32-byte hex string)
    console.warn('[Crypto] ENCRYPTION_KEY not set — using fallback key. Set a 64-char hex string in env for production.');
    return crypto.createHash('sha256').update('autotest-default-key-change-me').digest();
  }
  // Accept hex string (64 chars = 32 bytes) or plain string hashed to 32 bytes
  if (/^[0-9a-f]{64}$/i.test(key)) {
    return Buffer.from(key, 'hex');
  }
  return crypto.createHash('sha256').update(key).digest();
}

function encrypt(plaintext) {
  if (!plaintext || plaintext === '{}') return plaintext;
  try {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Format: base64(iv + tag + ciphertext) prefixed with "enc:" marker
    const combined = Buffer.concat([iv, tag, encrypted]);
    return 'enc:' + combined.toString('base64');
  } catch (err) {
    console.error('[Crypto] Encryption failed:', err.message);
    return plaintext; // fallback to plain
  }
}

function decrypt(data) {
  if (!data || data === '{}') return data;
  // Not encrypted (legacy data or empty)
  if (!data.startsWith('enc:')) return data;
  try {
    const key = getKey();
    const combined = Buffer.from(data.slice(4), 'base64');
    const iv = combined.subarray(0, IV_LEN);
    const tag = combined.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const encrypted = combined.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('[Crypto] Decryption failed:', err.message);
    return data; // return as-is if decryption fails
  }
}

module.exports = { encrypt, decrypt };
