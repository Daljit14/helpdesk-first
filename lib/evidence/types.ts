import type { RedactionSummary } from "@/lib/knowledge/learning-redaction";
import type {
  AccountStatus,
  ConnectorError,
  DirectoryProvider,
} from "@/lib/autonomy/connectors/types";
import type { JudgedSource } from "@/lib/research/types";

export type IdentityEvidence = {
  provider: DirectoryProvider;
  status: AccountStatus | null;
  error: ConnectorError["kind"] | null;
  checkedAt: string;
};

export type EvidenceSource =
  | "user_description"
  | "user_answer"
  | "context"
  | "attachment"
  | "step_outcome"
  | "catalog"
  | "external_source";

export type ResearchEvidence = {
  queries: string[];
  sources: JudgedSource[];
  contradictsTopHypothesis?: boolean;
};

export type Fact = {
  id: string;
  statement: string;
  source: EvidenceSource;
  at?: string;
};

export type TestRef = {
  id: string;
  kind: "step_outcome" | "diagnostic_answer" | "action";
  summary: string;
  result: "supports" | "rejects";
  at?: string;
};

export type EvidenceHypothesis = {
  id: string;
  cause: string;
  guideSlug: string | null;
  rawConfidence: number;
  confidence: number;
  explanation: string;
  supporting: TestRef[];
  rejecting: TestRef[];
};

export type AttachmentFinding = {
  attachmentId: string;
  kind: "image" | "pdf" | "other";
  scanVerdict: "clean";
  pageCount: number | null;
  width: number | null;
  height: number | null;
};

export type EvidenceRecord = {
  version: 1;
  generatedAt: string;
  description: string;
  redaction: RedactionSummary;
  context: {
    platform: string | null;
    os: string | null;
    device: string | null;
    app: string | null;
    deviceOwnership: "personal" | "organization" | "unknown";
  };
  attachmentFindings: AttachmentFinding[];
  qa: { questionId: string; question: string | null; answer: string }[];
  confirmedFacts: Fact[];
  unknownFacts: string[];
  hypotheses: EvidenceHypothesis[];
  citations: { guideSlug: string; title: string; path: string }[];
  safetyWarnings: string[];
  missingInformation: string[];
  identity?: IdentityEvidence;
  research?: ResearchEvidence;
};
