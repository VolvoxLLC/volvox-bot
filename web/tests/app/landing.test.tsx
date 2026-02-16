import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LandingPage from "@/app/page";

describe("LandingPage", () => {
  it("renders the hero heading", () => {
    render(<LandingPage />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Bill Bot");
  });

  it("renders feature cards", () => {
    render(<LandingPage />);
    expect(screen.getByText("AI Chat")).toBeDefined();
    expect(screen.getByText("Moderation")).toBeDefined();
    expect(screen.getByText("Welcome Messages")).toBeDefined();
    expect(screen.getByText("Spam Detection")).toBeDefined();
    expect(screen.getByText("Runtime Config")).toBeDefined();
    expect(screen.getByText("Web Dashboard")).toBeDefined();
  });

  it("renders sign in button", () => {
    render(<LandingPage />);
    expect(screen.getByText("Sign In")).toBeDefined();
  });

  it("hides Add to Server button when CLIENT_ID is not set", () => {
    delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    render(<LandingPage />);
    expect(screen.queryByText("Add to Server")).toBeNull();
  });

  it("shows Add to Server buttons when CLIENT_ID is set", () => {
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = "test-client-id";
    render(<LandingPage />);
    expect(screen.getAllByText("Add to Server").length).toBeGreaterThan(0);
    delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  });

  it("renders footer with links", () => {
    render(<LandingPage />);
    expect(screen.getByText("GitHub")).toBeDefined();
    expect(screen.getByText("Discord")).toBeDefined();
  });

  it("has CTA section", () => {
    render(<LandingPage />);
    expect(screen.getByText("Ready to get started?")).toBeDefined();
  });
});
