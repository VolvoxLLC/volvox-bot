#!/usr/bin/env npx tsx
/**
 * SendBlue iMessage/SMS sender
 * Usage: npx tsx send.ts <phone> <message>
 */

const API_KEY = 'f3137d1f21d7b24d5951b8053e888b2f';
const API_SECRET = 'f66032f854dfbd398761e4eec0519a61';
const FROM_NUMBER = '+16232843671';
const API_URL = 'https://api.sendblue.co/api/send-message';

async function sendMessage(to: string, content: string): Promise<void> {
  const phone = to.startsWith('+') ? to : `+1${to}`;
  
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'sb-api-key-id': API_KEY,
      'sb-api-secret-key': API_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      number: phone,
      content: content,
      from_number: FROM_NUMBER,
    }),
  });

  const result = await response.json();
  
  if (result.status === 'OK' || result.status === 'QUEUED') {
    console.log('✅ Message sent!');
    console.log(`To: ${phone}`);
    console.log(`Status: ${result.status}`);
    if (result.message_handle) console.log(`Handle: ${result.message_handle}`);
  } else {
    console.error('❌ Failed:', result);
  }
}

const to = process.argv[2];
const message = process.argv.slice(3).join(' ');

if (!to || !message) {
  console.error('Usage: npx tsx send.ts <phone> <message>');
  process.exit(1);
}

sendMessage(to, message);
