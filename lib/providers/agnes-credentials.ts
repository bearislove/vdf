import { createHash } from "crypto";

export interface AgnesCredential {
  id: string;
  apiKey: string;
}

export type AgnesCredentialLane = "text" | "image" | "video";

const MISSING_CREDENTIALS_ERROR =
  "AGNES_AI_API_KEY hoặc AGNES_AI_API_KEYS chưa được cấu hình trong .env";

function parseCredentialPool(rawValue: string | undefined): string[] {
  const value = rawValue?.trim().replace(/^['"]|['"]$/g, "");
  if (!value) return [];
  if (!value.startsWith("[")) {
    return value.split(/[\n,]+/).map((key) => key.trim().replace(/^['"]|['"]$/g, ""));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      "AGNES_AI_API_KEYS phải là JSON array hợp lệ hoặc danh sách phân tách bằng dấu phẩy/xuống dòng"
    );
  }
  if (!Array.isArray(parsed) || !parsed.every((key) => typeof key === "string")) {
    throw new Error("AGNES_AI_API_KEYS phải là một JSON array chỉ chứa chuỗi");
  }
  return parsed;
}

function loadCredentials(): AgnesCredential[] {
  const keys = [
    ...parseCredentialPool(process.env.AGNES_AI_API_KEYS),
    process.env.AGNES_AI_API_KEY ?? "",
  ].map((key) => key.trim()).filter(Boolean);

  return Array.from(new Set(keys), (apiKey) => ({
    id: createHash("sha256").update(apiKey).digest("hex").slice(0, 16),
    apiKey,
  }));
}

const credentials = loadCredentials();
const cursors: Record<AgnesCredentialLane, number> = {
  text: 0,
  image: 0,
  video: 0,
};

function requireCredentials(): AgnesCredential[] {
  if (credentials.length === 0) throw new Error(MISSING_CREDENTIALS_ERROR);
  return credentials;
}

export function getNextAgnesCredential(lane: AgnesCredentialLane): AgnesCredential {
  const pool = requireCredentials();
  const cursor = cursors[lane];
  const credential = pool[cursor % pool.length];
  cursors[lane] = (cursor + 1) % pool.length;
  return credential;
}

export function getAgnesCredential(credentialId?: string): AgnesCredential {
  const pool = requireCredentials();
  if (!credentialId) return pool[0];

  const credential = pool.find(({ id }) => id === credentialId);
  if (!credential) {
    throw new Error(
      `Không tìm thấy Agnes credential ${credentialId}; token có thể đã bị xóa khỏi AGNES_AI_API_KEYS`
    );
  }
  return credential;
}

export function getAgnesPrimaryCredential(): AgnesCredential | undefined {
  return credentials[0];
}

export function getAgnesCredentialCount(): number {
  return credentials.length;
}
