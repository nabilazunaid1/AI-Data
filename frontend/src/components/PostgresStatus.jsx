import { guardianFetch as fetch } from "../services/apiClient.js";

import { useEffect, useState } from "react";

const HEALTH_URL = "/api/v1/database/health";

export default function PostgresStatus() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let active = true;
    let running = false;

    async function checkDatabase() {
      if (!active || running) return;

      running = true;

      try {
        const response = await fetch(
          `${HEALTH_URL}?t=${Date.now()}`,
          {
            method: "GET",
            cache: "no-store",
            headers: {
              Accept: "application/json"
            }
          }
        );

        if (!response.ok) {
          throw new Error(
            `Database health HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (!active) return;

        setStatus(
          data.status === "connected"
            ? "connected"
            : "disconnected"
        );
      } catch (error) {
        if (!active) return;

        console.warn(
          "PostgreSQL health check failed:",
          error.message
        );

        setStatus("disconnected");
      } finally {
        running = false;
      }
    }

    // Immediately check when the component mounts.
    checkDatabase();

    // Repeat automatically every five seconds.
    const interval = setInterval(checkDatabase, 5000);

    // Recheck when returning to the browser tab.
    const handleFocus = () => {
      checkDatabase();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkDatabase();
      }
    };

    window.addEventListener("focus", handleFocus);

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    return () => {
      active = false;

      clearInterval(interval);

      window.removeEventListener(
        "focus",
        handleFocus
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, []);

  const connected = status === "connected";
  const checking = status === "checking";

  const color = connected
    ? "#23e079"
    : checking
      ? "#94a3b8"
      : "#ffbd45";

  const label = connected
    ? "Connected: PostgreSQL"
    : checking
      ? "Checking PostgreSQL..."
      : "PostgreSQL: Not connected";

  return (
    <div
      className="connection-status"
      role="status"
      aria-live="polite"
      title={`PostgreSQL: ${status}`}
    >
      <span
        className="status-dot"
        style={{
          backgroundColor: color
        }}
      />

      {label}
    </div>
  );
}
