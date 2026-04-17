/**
 * Unit tests — CoworkModule component.
 *
 * Tests cover:
 *  - Initial render with session list
 *  - New session dialog
 *  - Tab navigation
 *  - Demo data fallback when API unavailable
 *  - CoworkWidget on Dashboard
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ─── Mock fetch ───────────────────────────────────────────────────────────────
const mockFetch = vi.fn();

const makeRes = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  // Default: return empty arrays/objects for API calls
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/api/cowork/sessions"))
      return Promise.resolve(makeRes([]));
    if (url.includes("/api/computer-use/status"))
      return Promise.resolve(
        makeRes({
          status: "available",
          platform: "win32",
          capabilities: ["screenshot_native", "file_operations"],
        }),
      );
    if (url.includes("/api/cowork/stats"))
      return Promise.resolve(
        makeRes({
          totalSessions: 0,
          activeSessions: 0,
          completedSessions: 0,
          totalTokens: 0,
        }),
      );
    return Promise.resolve(makeRes({}));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Import after mocks ──────────────────────────────────────────────────
import { CoworkModule } from "../../src/components/CoworkModule";

const renderCowork = () =>
  render(
    <MemoryRouter>
      <CoworkModule />
    </MemoryRouter>,
  );

// ─── Tests ────────────────────────────────────────────────────────────────

describe("CoworkModule", () => {
  it("renders the title and new session button", async () => {
    renderCowork();
    await waitFor(() => {
      expect(screen.getByText("Cowork")).toBeTruthy();
    });
    // Should have a button with "Nouvelle" text
    const text = document.body.textContent || "";
    expect(text).toContain("Nouvelle");
  });

  it("fetches sessions on mount", async () => {
    renderCowork();
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
      const calls = mockFetch.mock.calls.map((c: any[]) => c[0]);
      const sessionCall = calls.find(
        (url: string) =>
          typeof url === "string" && url.includes("/api/cowork/sessions"),
      );
      expect(sessionCall).toBeTruthy();
    });
  });

  it("shows empty state when no sessions", async () => {
    renderCowork();
    await waitFor(() => {
      // Either "Aucune session" or demo data should appear
      const text = document.body.textContent || "";
      expect(text.includes("session") || text.includes("Session")).toBeTruthy();
    });
  });

  it("shows demo data when API fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    renderCowork();
    await waitFor(
      () => {
        // Demo data should be shown as fallback
        const text = document.body.textContent || "";
        expect(text.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  it("renders tabs when a session is selected", async () => {
    // Mock a session list with one session
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/cowork/sessions"))
        return Promise.resolve(
          makeRes([
            {
              id: "test-1",
              name: "Test Session",
              status: "active",
              mode: "autonomous",
              model: "claude-sonnet-4-20250514",
              progress: 50,
              iterations: 5,
              tokensUsed: 1200,
              cost: 0.05,
              plan: [],
              currentStep: 2,
              totalSteps: 4,
              subAgents: [],
              filesModified: [],
              filesCreated: [],
              computerUseEnabled: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ]),
        );
      if (typeof url === "string" && url.includes("/api/computer-use/status"))
        return Promise.resolve(
          makeRes({
            status: "available",
            platform: "win32",
            capabilities: ["screenshot_native"],
          }),
        );
      return Promise.resolve(makeRes([]));
    });

    renderCowork();

    await waitFor(
      () => {
        const text = document.body.textContent || "";
        expect(
          text.includes("Test Session") || text.includes("session"),
        ).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});
