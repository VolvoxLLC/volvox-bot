import { describe, it, expect } from "vitest";
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

  it("renders sign in and add to server buttons", () => {
    render(<LandingPage />);
    expect(screen.getByText("Sign In")).toBeDefined();
    expect(screen.getAllByText("Add to Server").length).toBeGreaterThan(0);
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
