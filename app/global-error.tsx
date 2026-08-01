"use client";

// Last-resort boundary: catches errors thrown by the ROOT layout itself, which
// app/error.tsx and app/admin/error.tsx can never see (they render inside it).
// It replaces <html> entirely, so globals.css and the token system are NOT
// available here — every style must be inline. Keep this file dependency-free:
// anything it imports becomes a way for it to fail too.
//
// As with the route boundaries, only `digest` is surfaced — in production Next
// has already replaced the thrown message with it, and the raw message would
// leak internals for no user benefit.
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#1c1c1c",
          color: "#e8e8e8",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "48px 24px"
        }}
      >
        <main style={{ width: "100%", maxWidth: 440, background: "#ffffff", color: "#161616", padding: 32 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>The app could not start</h1>
          <p style={{ marginTop: 16, fontSize: 13, lineHeight: "20px", color: "#525252" }}>
            Something failed before the page could render at all. The seating data is unchanged — this is a display
            problem, not a data one.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              width: "100%",
              minHeight: 44,
              border: "1px solid #161616",
              background: "#161616",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ marginTop: 24, fontFamily: "monospace", fontSize: 11, color: "#8d8d8d" }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
        <p style={{ marginTop: 40, fontFamily: "monospace", fontSize: 11, color: "#8d8d8d" }}>
          seats.megeredchianlaw.com · internal use only
        </p>
      </body>
    </html>
  );
}
