// collectors/jsonl-utils.js
// Shared utilities for safe JSONL file operations with locking

const fsp = require("fs/promises");

/**
 * Safely append data to a JSONL file with file locking to prevent race conditions.
 * Uses lock files to ensure exclusive access during write operations.
 *
 * @param {string} filePath - Path to the JSONL file
 * @param {Object} data - Data object to append as a JSON line
 * @param {number} maxRetries - Maximum number of retry attempts (default: 5)
 * @param {number} retryDelay - Base retry delay in milliseconds (default: 100)
 */
async function appendToJsonlSafe(filePath, data, maxRetries = 5, retryDelay = 100) {
  const jsonLine = JSON.stringify(data) + '\n';
  const lockFile = `${filePath}.lock`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let lockFd = null;
    try {
      // Try to acquire lock (exclusive create)
      lockFd = await fsp.open(lockFile, 'wx');

      // Write data
      await fsp.appendFile(filePath, jsonLine);

      // Release lock
      await lockFd.close();
      await fsp.unlink(lockFile).catch(() => {});
      return;
    } catch (error) {
      if (lockFd) await lockFd.close().catch(() => {});

      if (error.code === 'EEXIST') {
        // Lock held by another process, retry
        await new Promise(r => setTimeout(r, retryDelay * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Failed to acquire lock for ${filePath} after ${maxRetries} attempts`);
}

module.exports = {
  appendToJsonlSafe
};
