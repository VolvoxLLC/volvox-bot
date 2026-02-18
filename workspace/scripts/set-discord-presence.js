#!/usr/bin/env node
// Set Discord bot presence directly via Discord API

const https = require('https');
const fs = require('fs');
const path = require('path');

// Read config to get bot token
const configPath = path.join(process.env.HOME, '.openclaw', 'openclaw.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const token = config.channels?.discord?.accounts?.pip?.token;

if (!token) {
    console.error('No Discord token found for pip account');
    process.exit(1);
}

// Parse args
const args = process.argv.slice(2);
const type = args[0] || 'watching';
const name = args[1] || "Bill's inbox 📧";
const status = args[2] || 'online';

// Activity types: 0=Playing, 1=Streaming, 2=Listening, 3=Watching, 5=Competing
const typeMap = { playing: 0, streaming: 1, listening: 2, watching: 3, competing: 5 };

const payload = JSON.stringify({
    activities: [{
        name: name,
        type: typeMap[type.toLowerCase()] ?? 3
    }],
    status: status
});

const options = {
    hostname: 'discord.com',
    port: 443,
    path: '/api/v10/users/@me',
    method: 'PATCH',
    headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 204) {
            console.log(`✅ Presence set: ${type} "${name}" (${status})`);
        } else {
            console.error(`❌ Failed: ${res.statusCode} ${data}`);
            process.exit(1);
        }
    });
});

req.on('error', (e) => {
    console.error(`❌ Request failed: ${e.message}`);
    process.exit(1);
});

req.write(payload);
req.end();
