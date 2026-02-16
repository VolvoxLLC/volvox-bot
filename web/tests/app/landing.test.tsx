import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LandingPage from "@/app/page";

describe("LandingPage", () => {
  const originalClientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;

  afterEach(() => {
    // Restore env var to prevent pollution between tests
    if (originalClientId !== undefined) {
      process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = originalClientId;
    } else {
      delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    }
  });

  it("renders the hero heading", () => {
    render(<LandingPage />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Bill Bot");
  });

  it("renders feature cards", () => {
    render(<LandingPage />);
    expect(screen.getByText("AI Chat")).toBeInTheDocument();
    expect(screen.getByText("Moderation")).toBeInTheDocument();
    expect(screen.getByText("Welcome Messages")).toBeInTheDocument();
    expect(screen.getByText("Spam Detection")).toBeInTheDocument();
    expect(screen.getByText("Runtime Config")).toBeInTheDocument();
    expect(screen.getByText("Web Dashboard")).toBeInTheDocument();
  });

  it("renders sign in button", () => {
    render(<LandingPage />);
    expect(screen.getByText("Sign In")).toBeInTheDocument();
  });

  it("hides Add to Server button when CLIENT_ID is not set", () => {
    delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    render(<LandingPage />);
    expect(screen.queryByText("Add to Server")).not.toBeInTheDocument();
  });

  it("shows Add to Server buttons when CLIENT_ID is set", () => {
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = "test-client-id";
    render(<LandingPage />);
    expect(screen.getAllByText("Add to Server").length).toBeGreaterThan(0);
  });

  it("renders footer with links", () => {
    render(<LandingPage />);
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Discord")).toBeInTheDocument();
  });

  it("has CTA section", () => {
    render(<LandingPage />);
    expect(screen.getByText("Ready to get started?")).toBeInTheDocument();
  });
});
