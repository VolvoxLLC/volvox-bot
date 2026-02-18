#!/usr/bin/env node
// Check Claude usage via OAuth API (with token refresh)

const fs = require('fs');
const path = require('path');

const CREDS_FILE = path.join(process.env.HOME, '.claude', '.credentials.json');
const STATE_FILE = path.join(process.env.HOME, '.openclaw/workspace/memory/claude-usage-state.json');

async function refreshAccessToken(refreshToken) {
    const response = await fetch('https://api.anthropic.com/api/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'anthropic-beta': 'oauth-2025-04-20'
        },
        body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        })
    });

    if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
    }

    return await response.json();
}

async function main() {
    try {
        // Read credentials
        if (!fs.existsSync(CREDS_FILE)) {
            console.log(JSON.stringify({ error: 'No credentials file' }));
            process.exit(1);
        }

        let creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
        let accessToken = creds?.claudeAiOauth?.accessToken;
        const refreshToken = creds?.claudeAiOauth?.refreshToken;
        const expiresAt = creds?.claudeAiOauth?.expiresAt;

        if (!accessToken) {
            console.log(JSON.stringify({ error: 'No access token' }));
            process.exit(1);
        }

        // Check expiry - try refresh if needed, but don't fail
        // Token may still work even if expiresAt says otherwise (Anthropic OAuth quirk)
        if (expiresAt && Date.now() > expiresAt && refreshToken) {
            try {
                const newTokens = await refreshAccessToken(refreshToken);
                
                // Update credentials file
                creds.claudeAiOauth.accessToken = newTokens.access_token;
                if (newTokens.refresh_token) {
                    creds.claudeAiOauth.refreshToken = newTokens.refresh_token;
                }
                creds.claudeAiOauth.expiresAt = Date.now() + (newTokens.expires_in * 1000);
                
                fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));
                accessToken = newTokens.access_token;
            } catch (refreshErr) {
                // Refresh failed - try the existing token anyway (it often still works)
            }
        }

        // Fetch usage
        const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'anthropic-beta': 'oauth-2025-04-20',
                'User-Agent': 'claude-code/2.1.5',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.log(JSON.stringify({ error: `API error: ${response.status}` }));
            process.exit(1);
        }

        const data = await response.json();
        const fiveHour = data.five_hour?.utilization || 0;
        const sevenDay = data.seven_day?.utilization || 0;

        // Determine alert level
        let alertLevel = 'none';
        if (fiveHour >= 90) alertLevel = 'critical';
        else if (fiveHour >= 80) alertLevel = 'high';
        else if (fiveHour >= 70) alertLevel = 'warning';
        else if (fiveHour >= 60) alertLevel = 'elevated';
        else if (fiveHour >= 50) alertLevel = 'moderate';

        // Load previous state to check for threshold crossings
        let prevState = { lastAlertLevel: 'none', lastFiveHour: 0 };
        try {
            if (fs.existsSync(STATE_FILE)) {
                prevState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            }
        } catch (e) {}

        // Check if we crossed a 10% threshold
        const prevBucket = Math.floor(prevState.lastFiveHour / 10);
        const currBucket = Math.floor(fiveHour / 10);
        const crossedThreshold = currBucket > prevBucket && fiveHour >= 50;

        // Save current state
        const newState = {
            lastAlertLevel: alertLevel,
            lastFiveHour: fiveHour,
            lastSevenDay: sevenDay,
            lastChecked: new Date().toISOString()
        };
        fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2));

        // Output result
        const result = {
            five_hour: {
                utilization: fiveHour,
                resets_at: data.five_hour?.resets_at
            },
            seven_day: {
                utilization: sevenDay,
                resets_at: data.seven_day?.resets_at
            },
            alert_level: alertLevel,
            should_alert: alertLevel !== 'none',
            crossed_threshold: crossedThreshold,
            checked_at: new Date().toISOString()
        };

        console.log(JSON.stringify(result, null, 2));

    } catch (err) {
        console.log(JSON.stringify({ error: err.message }));
        process.exit(1);
    }
}

main();
