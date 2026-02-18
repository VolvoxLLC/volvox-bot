import { afterEach, describe, expect, it, vi } from "vitest";
import {
  broadcastSelectedGuild,
  GUILD_SELECTED_EVENT,
  SELECTED_GUILD_KEY,
} from "@/lib/guild-selection";

describe("guild-selection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("persists and dispatches normalized guild ID for non-empty values", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    broadcastSelectedGuild("  guild-123  ");

    expect(localStorage.getItem(SELECTED_GUILD_KEY)).toBe("guild-123");
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent<string>;
    expect(event.type).toBe(GUILD_SELECTED_EVENT);
    expect(event.detail).toBe("guild-123");
  });

  it("does not persist or dispatch event for empty or whitespace guild IDs", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    broadcastSelectedGuild("");
    broadcastSelectedGuild("   ");

    expect(localStorage.getItem(SELECTED_GUILD_KEY)).toBeNull();
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
