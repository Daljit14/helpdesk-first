export type ScanResult = {
  verdict: "clean" | "infected" | "suspicious" | "unscanned" | "error";
  engine: string;
  detail?: string;
};

export interface AttachmentScanner {
  scan(
    bytes: Uint8Array,
    meta: { sha256: string; mime: string }
  ): Promise<ScanResult>;
}

export class NoScanner implements AttachmentScanner {
  async scan(
    _bytes: Uint8Array,
    _meta: { sha256: string; mime: string }
  ): Promise<ScanResult> {
    void _bytes;
    void _meta;
    return { verdict: "unscanned", engine: "none" };
  }
}

type FetchLike = typeof fetch;

function analysisVerdict(attributes: {
  last_analysis_stats?: Record<string, number>;
}): ScanResult["verdict"] {
  const stats = attributes.last_analysis_stats ?? {};
  if ((stats.malicious ?? 0) > 0) return "infected";
  if ((stats.suspicious ?? 0) > 0) return "suspicious";
  return "clean";
}

export class VirusTotalScanner implements AttachmentScanner {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(
    apiKey = process.env.VIRUSTOTAL_API_KEY ?? "",
    fetchImpl = fetch
  ) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  private headers(): HeadersInit {
    return { "x-apikey": this.apiKey };
  }

  private async getAnalysis(url: string): Promise<ScanResult | null> {
    const response = await this.fetchImpl(url, { headers: this.headers() });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      data?: { attributes?: { last_analysis_stats?: Record<string, number> } };
    };
    if (!body.data?.attributes) return null;
    return {
      verdict: analysisVerdict(body.data.attributes),
      engine: "virustotal",
    };
  }

  async scan(
    bytes: Uint8Array,
    meta: { sha256: string; mime: string }
  ): Promise<ScanResult> {
    if (!this.apiKey) {
      return {
        verdict: "error",
        engine: "virustotal",
        detail: "Missing API key.",
      };
    }
    try {
      const base = "https://www.virustotal.com/api/v3";
      const cached = await this.fetchImpl(`${base}/files/${meta.sha256}`, {
        headers: this.headers(),
      });
      if (cached.ok) {
        const body = (await cached.json()) as {
          data?: {
            attributes?: { last_analysis_stats?: Record<string, number> };
          };
        };
        if (body.data?.attributes) {
          return {
            verdict: analysisVerdict(body.data.attributes),
            engine: "virustotal",
          };
        }
      } else if (cached.status !== 404) {
        return {
          verdict: "error",
          engine: "virustotal",
          detail: `Lookup failed with ${cached.status}.`,
        };
      }

      const form = new FormData();
      form.append(
        "file",
        new Blob(
          [
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength
            ) as ArrayBuffer,
          ],
          { type: meta.mime }
        ),
        "attachment"
      );
      const uploaded = await this.fetchImpl(`${base}/files`, {
        method: "POST",
        headers: this.headers(),
        body: form,
      });
      if (!uploaded.ok) {
        return {
          verdict: "error",
          engine: "virustotal",
          detail: `Upload failed with ${uploaded.status}.`,
        };
      }

      const uploadBody = (await uploaded.json()) as {
        data?: { links?: { self?: string }; id?: string };
      };
      const analysisUrl =
        uploadBody.data?.links?.self ??
        (uploadBody.data?.id
          ? `${base}/analyses/${uploadBody.data.id}`
          : `${base}/files/${meta.sha256}`);
      const deadline = Date.now() + 20_000;
      while (Date.now() <= deadline) {
        const result = await this.getAnalysis(analysisUrl);
        if (result) return result;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      return {
        verdict: "error",
        engine: "virustotal",
        detail: "Analysis timed out.",
      };
    } catch (error) {
      return {
        verdict: "error",
        engine: "virustotal",
        detail:
          error instanceof Error ? error.message : "Scanner request failed.",
      };
    }
  }
}

export function createScanner(): AttachmentScanner {
  if (
    process.env.HELP_DESK_ATTACHMENT_SCANNER === "virustotal" &&
    process.env.VIRUSTOTAL_API_KEY
  ) {
    return new VirusTotalScanner();
  }
  return new NoScanner();
}
