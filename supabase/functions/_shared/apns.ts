// APNs HTTP/2 sender. Requires:
//   APNS_TEAM_ID      - Apple Developer Team ID
//   APNS_KEY_ID       - .p8 Key ID
//   APNS_BUNDLE_ID    - iOS app bundle ID (e.g. com.ravedar.app)
//   APNS_AUTH_KEY_P8  - base64-encoded contents of AuthKey_<keyid>.p8
//   APNS_USE_SANDBOX  - "true" to send to sandbox (development); else production.

let cachedJwt: { token: string; expiresAt: number } | null = null;

async function getApnsJwt(): Promise<string> {
  if (cachedJwt && cachedJwt.expiresAt > Date.now() + 60_000) {
    return cachedJwt.token;
  }
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const p8B64 = Deno.env.get("APNS_AUTH_KEY_P8");
  if (!teamId || !keyId || !p8B64) {
    throw new Error("APNS_* env vars not all set");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId };
  const claim = { iss: teamId, iat: now };
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");
  const unsigned = `${enc(header)}.${enc(claim)}`;

  const pem = atob(p8B64);
  const pemStripped = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pemStripped), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(unsigned)
    )
  );
  const sig = btoa(String.fromCharCode(...sigBytes))
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
  const token = `${unsigned}.${sig}`;
  cachedJwt = { token, expiresAt: Date.now() + 50 * 60 * 1000 };
  return token;
}

export type ApnsSendResult = { ok: true } | { ok: false; badToken: boolean; error: string };

export async function sendApns(token: string, title: string, body: string): Promise<ApnsSendResult> {
  const bundleId = Deno.env.get("APNS_BUNDLE_ID");
  if (!bundleId) return { ok: false, badToken: false, error: "APNS_BUNDLE_ID not set" };
  const host =
    Deno.env.get("APNS_USE_SANDBOX") === "true"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";

  const jwt = await getApnsJwt();
  const res = await fetch(`${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      authorization: `bearer ${jwt}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: {
        alert: { title, body },
        sound: "default",
      },
    }),
  });

  if (res.ok) return { ok: true };
  const txt = await res.text();
  const badToken =
    res.status === 410 ||
    txt.includes("Unregistered") ||
    txt.includes("BadDeviceToken");
  return { ok: false, badToken, error: `apns ${res.status} ${txt}` };
}
