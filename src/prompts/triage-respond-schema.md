Respond with a single raw JSON object. No markdown fences, no explanation text outside the JSON.

CRITICAL: Your entire response must be valid JSON — nothing else. No preamble, no narration,
no "let me check" commentary. If you used a tool (e.g. WebSearch), incorporate the results
directly into your JSON response. Never output your reasoning about tool results as plain text.

Required schema:
{
  "responses": [
    {
      "targetMessageId": "msg-XXX",
      "targetUser": "username",
      "response": "your response text"
    }
  ]
}
