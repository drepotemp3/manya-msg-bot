import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure your log file path
const logFilePath = path.join(__dirname, 'realtime_log.txt');

function logStringToFile(str) {
  // Create the formatted string with 7 newlines above and below
  const formattedString = '\n\n\n\n\n\n\n' + str + '\n\n\n\n\n\n\n';
  
  // Append to file (creates file if it doesn't exist)
  fs.appendFile(logFilePath, formattedString, 'utf8', (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });
  
  // Still log to console
  console.log(str);
}

export default logStringToFile