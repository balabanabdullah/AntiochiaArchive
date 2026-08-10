import crypto from "crypto";

function tokensMatch(provided, expected) {
  const providedBuffer = Buffer.from(provided || "", "utf8");
  const expectedBuffer = Buffer.from(expected || "", "utf8");
  return providedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

/** Require the environment-provided administrator bearer token. */
export function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_TOKEN || "";
  if (!expected) {
    return res.status(503).json({
      success: false,
      error: "Administrator authentication is not configured.",
    });
  }

  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match || !tokensMatch(match[1], expected)) {
    return res.status(401).json({
      success: false,
      error: "Administrator authentication required.",
    });
  }

  next();
}
