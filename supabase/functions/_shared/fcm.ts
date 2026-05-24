// FCM HTTP v1 sender. Requires FCM_SERVICE_ACCOUNT_JSON env var
// (JSON.stringified service account from Firebase console).

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = { alg: "RS256", typ: "JWT" };
  const jwtClaim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");

  const unsigned = `${enc(jwtHeader)}.${enc(jwtClaim)}`;

  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned))
  );
  const sig = btoa(String.fromCharCode(...sigBytes))
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
  const jwt = `${unsigned}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`fcm oauth ${res.status} ${await res.text()}`);
  }
  const j = await res.json();
  cachedToken = { token: j.access_token, expiresAt: Date.now() + (j.expires_in - 60) * 1000 };
  return cachedToken.token;
}

export type FcmSendResult = { ok: true } | { ok: false; badToken: boolean; error: string };

export async function sendFcm(token: string, title: string, body: string): Promise<FcmSendResult> {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) return { ok: false, badToken: false, error: "FCM_SERVICE_ACCOUNT_JSON not set" };
  const sa: ServiceAccount = JSON.parse(raw);

  const accessToken = await getAccessToken(sa);
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
        },
      }),
    }
  );
  if (res.ok) return { ok: true };
  const txt = await res.text();
  const badToken = res.status === 404 || txt.includes("UNREGISTERED") || txt.includes("INVALID_ARGUMENT");
  return { ok: false, badToken, error: `fcm ${res.status} ${txt}` };
}
