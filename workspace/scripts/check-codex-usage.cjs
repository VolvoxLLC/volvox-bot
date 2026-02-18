#!/usr/bin/env node
// Check OpenAI Codex usage via /api/codex/usage endpoint
// Uses ChatGPT OAuth tokens from ~/.codex/auth.json
// Mirrors check-claude-usage.js output format for consistency

const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(process.env.HOME, '.codex', 'auth.json');
const STATE_FILE = path.join(process.env.HOME, '.openclaw/workspace/memory/codex-usage-state.json');

async function refreshAccessToken(refreshToken) {
    // OpenAI uses standard OAuth2 token refresh
    const response = await fetch('https://auth.openai.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'refresh_token',
            client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
            refresh_token: refreshToken,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token refresh failed: ${response.status} ${text}`);
    }

    return await response.json();
}

async function main() {
    try {
        if (!fs.existsSync(AUTH_FILE)) {
            console.log(JSON.stringify({ error: 'No codex auth file (~/.codex/auth.json)' }));
            process.exit(1);
        }

        const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));

        if (auth.auth_mode !== 'chatgpt') {
            console.log(JSON.stringify({ error: `Auth mode "${auth.auth_mode}" not supported (need chatgpt)` }));
            process.exit(1);
        }

        let accessToken = auth.tokens?.access_token;
        const refreshToken = auth.tokens?.refresh_token;
        const accountId = auth.tokens?.account_id;

        if (!accessToken) {
            console.log(JSON.stringify({ error: 'No access token in auth.json' }));
            process.exit(1);
        }

        // Check if token is expired by decoding JWT
        try {
            const payload = JSON.parse(
                Buffer.from(accessToken.split('.')[1], 'base64').toString()
            );
            const expiry = payload.exp * 1000;
            if (Date.now() > expiry && refreshToken) {
                try {
                    const newTokens = await refreshAccessToken(refreshToken);
                    accessToken = newTokens.access_token;

                    // Update auth.json with new tokens
                    auth.tokens.access_token = newTokens.access_token;
                    if (newTokens.refresh_token) {
                        auth.tokens.refresh_token = newTokens.refresh_token;
                    }
                    if (newTokens.id_token) {
                        auth.tokens.id_token = newTokens.id_token;
                    }
                    auth.last_refresh = new Date().toISOString();
                    fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2));
                } catch (refreshErr) {
                    // Try the existing token anyway — it may still work
                }
            }
        } catch (e) {
            // JWT decode failed, try the token anyway
        }

        // Build headers matching the Codex CLI (from source code)
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'codex-cli',
            'Content-Type': 'application/json',
        };
        if (accountId) {
            headers['ChatGPT-Account-Id'] = accountId;
        }

        // Hit the usage endpoint (same as Codex CLI — chatgpt.com/backend-api/wham/usage)
        const response = await fetch('https://chatgpt.com/backend-api/wham/usage', { headers });

        if (!response.ok) {
            const body = await response.text();
            console.log(JSON.stringify({
                error: `API error: ${response.status}`,
                body: body.substring(0, 200),
            }));
            process.exit(1);
        }

        const data = await response.json();

        // Parse response based on Codex source code structure:
        // {
        //   plan_type: "plus"|"pro",
        //   rate_limit: {
        //     allowed: bool,
        //     limit_reached: bool,
        //     primary_window: { used_percent, limit_window_seconds, reset_after_seconds, reset_at },
        //     secondary_window: { ... }
        //   },
        //   additional_rate_limits: [{ limit_name, metered_feature, rate_limit: { ... } }]
        // }

        const planType = data.plan_type || 'unknown';
        const rl = data.rate_limit || {};
        const primary = rl.primary_window || {};
        const secondary = rl.secondary_window || {};

        const primaryUsed = primary.used_percent ?? null;
        const secondaryUsed = secondary.used_percent ?? null;

        const primaryWindowMin = primary.limit_window_seconds
            ? Math.round(primary.limit_window_seconds / 60)
            : null;
        const secondaryWindowMin = secondary.limit_window_seconds
            ? Math.round(secondary.limit_window_seconds / 60)
            : null;

        // Determine alert level based on primary window (same thresholds as Claude)
        let alertLevel = 'none';
        if (primaryUsed !== null) {
            if (primaryUsed >= 90) alertLevel = 'critical';
            else if (primaryUsed >= 80) alertLevel = 'high';
            else if (primaryUsed >= 70) alertLevel = 'warning';
            else if (primaryUsed >= 60) alertLevel = 'elevated';
            else if (primaryUsed >= 50) alertLevel = 'moderate';
        }

        // Load previous state
        let prevState = { lastAlertLevel: 'none', lastPrimaryUsed: 0 };
        try {
            if (fs.existsSync(STATE_FILE)) {
                prevState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            }
        } catch (e) {}

        // Check threshold crossing
        const prevBucket = Math.floor((prevState.lastPrimaryUsed || 0) / 10);
        const currBucket = Math.floor((primaryUsed || 0) / 10);
        const crossedThreshold = currBucket > prevBucket && (primaryUsed || 0) >= 50;

        // Parse additional rate limits
        const additionalLimits = (data.additional_rate_limits || []).map(item => ({
            limit_name: item.limit_name || item.metered_feature,
            primary_used: item.rate_limit?.primary_window?.used_percent ?? null,
            primary_window_min: item.rate_limit?.primary_window?.limit_window_seconds
                ? Math.round(item.rate_limit.primary_window.limit_window_seconds / 60)
                : null,
            primary_reset_at: item.rate_limit?.primary_window?.reset_at
                ? new Date(item.rate_limit.primary_window.reset_at * 1000).toISOString()
                : null,
        }));

        // Save state
        const newState = {
            lastAlertLevel: alertLevel,
            lastPrimaryUsed: primaryUsed,
            lastSecondaryUsed: secondaryUsed,
            lastChecked: new Date().toISOString(),
        };
        fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2));

        // Parse credits info
        const credits = data.credits || {};
        const creditsInfo = {
            has_credits: credits.has_credits ?? false,
            unlimited: credits.unlimited ?? false,
            balance: credits.balance ?? '0',
        };

        // Parse code review rate limit
        const codeReview = data.code_review_rate_limit || {};
        const codeReviewPrimary = codeReview.primary_window || {};

        // Output result (matching check-claude-usage.js format)
        const result = {
            plan_type: planType,
            primary: {
                utilization: primaryUsed,
                window_minutes: primaryWindowMin,
                resets_at: primary.reset_at
                    ? new Date(primary.reset_at * 1000).toISOString()
                    : null,
                reset_after_seconds: primary.reset_after_seconds ?? null,
            },
            secondary: {
                utilization: secondaryUsed,
                window_minutes: secondaryWindowMin,
                resets_at: secondary.reset_at
                    ? new Date(secondary.reset_at * 1000).toISOString()
                    : null,
                reset_after_seconds: secondary.reset_after_seconds ?? null,
            },
            allowed: rl.allowed ?? null,
            limit_reached: rl.limit_reached ?? null,
            credits: creditsInfo,
            code_review: codeReviewPrimary.used_percent != null ? {
                utilization: codeReviewPrimary.used_percent,
                window_minutes: codeReviewPrimary.limit_window_seconds
                    ? Math.round(codeReviewPrimary.limit_window_seconds / 60)
                    : null,
            } : undefined,
            additional_limits: additionalLimits.length > 0 ? additionalLimits : undefined,
            alert_level: alertLevel,
            should_alert: alertLevel !== 'none',
            crossed_threshold: crossedThreshold,
            checked_at: new Date().toISOString(),
        };

        console.log(JSON.stringify(result, null, 2));
    } catch (err) {
        console.log(JSON.stringify({ error: err.message }));
        process.exit(1);
    }
}

main();
