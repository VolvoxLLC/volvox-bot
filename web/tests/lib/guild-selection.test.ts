import { afterEach, describe, expect, it, vi } from "vitest";
import {
  broadcastSelectedGuild,
  GUILD_SELECTED_EVENT,
} from "@/lib/guild-selection";

describe("guild-selection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches guild selected event for non-empty guild IDs", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    broadcastSelectedGuild("guild-123");

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent<string>;
    expect(event.type).toBe(GUILD_SELECTED_EVENT);
    expect(event.detail).toBe("guild-123");
  });

  it("does not dispatch event for empty or whitespace guild IDs", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    broadcastSelectedGuild("");
    broadcastSelectedGuild("   ");

    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
