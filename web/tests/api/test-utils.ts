import { expect } from 'vitest';

export function expectStatus(response: Response, expectedStatus: number) {
  expect(response.status).toBe(expectedStatus);
}

export async function expectJsonResponse(
  response: Response,
  expectedStatus: number,
  expectedBody: unknown,
) {
  expectStatus(response, expectedStatus);
  await expect(response.json()).resolves.toEqual(expectedBody);
}

export async function expectJsonErrorContaining(
  response: Response,
  expectedStatus: number,
  expectedMessage: string | RegExp,
) {
  expectStatus(response, expectedStatus);
  const body = (await response.json()) as { error?: unknown };

  expect(typeof body.error).toBe('string');
  if (typeof body.error !== 'string') {
    return;
  }

  if (expectedMessage instanceof RegExp) {
    expect(body.error).toMatch(expectedMessage);
  } else {
    expect(body.error).toContain(expectedMessage);
  }
}
