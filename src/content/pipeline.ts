export type ContentType = 'ad_copy' | 'landing_page' | 'email_sequence' | 'social_post';
export type ReviewState = 'draft' | 'review' | 'approved' | 'rejected';

export interface ContentTemplate {
  templateId: string;
  version: number;
  contentType: ContentType;
  name: string;
  body: string;
  requiredVariables: string[];
  createdBy: string;
  createdAt: string;
}

export interface ContentGenerationRequest {
  artifactId: string;
  campaignId: string;
  templateId: string;
  templateVersion?: number;
  input: Record<string, string | number | boolean>;
  requestedBy: string;
  requestedAt: string;
}

export interface ContentRevision {
  artifactId: string;
  campaignId: string;
  revision: number;
  state: ReviewState;
  templateId: string;
  templateVersion: number;
  generatedBy: string;
  generatedAt: string;
  revisedFromRevision?: number;
  input: Record<string, string>;
  renderedContent: string;
  deterministicHash: string;
  reviewSubmittedAt?: string;
  reviewSubmittedBy?: string;
  reviewerId?: string;
  reviewerComment?: string;
  reviewedAt?: string;
}

export interface ContentAuditEntry {
  artifactId: string;
  revision: number;
  action: 'draft_generated' | 'submitted_for_review' | 'approved' | 'rejected' | 'revised';
  actorId: string;
  at: string;
  detail?: string;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeInput(
  input: Record<string, string | number | boolean>
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = normalizeText(key);
    if (!normalizedKey) {
      continue;
    }

    normalized[normalizedKey] = normalizeText(String(value));
  }

  return normalized;
}

function stableHash(parts: unknown[]): string {
  const payload = JSON.stringify(parts);
  let hash = 0;
  for (let index = 0; index < payload.length; index += 1) {
    hash = (hash * 31 + payload.charCodeAt(index)) >>> 0;
  }

  return `content_${hash.toString(16).padStart(8, '0')}`;
}

function renderTemplateBody(
  template: ContentTemplate,
  input: Record<string, string>
): {
  renderedContent: string;
  deterministicHash: string;
} {
  const placeholders = new Set<string>();
  const placeholderRegex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

  let match = placeholderRegex.exec(template.body);
  while (match) {
    placeholders.add(match[1]);
    match = placeholderRegex.exec(template.body);
  }

  for (const variable of template.requiredVariables) {
    if (!(variable in input)) {
      throw new Error(`Missing required variable for template rendering: ${variable}`);
    }
  }

  for (const placeholder of placeholders) {
    if (!(placeholder in input)) {
      throw new Error(`Missing variable used by template body: ${placeholder}`);
    }
  }

  let renderedContent = template.body;
  for (const placeholder of placeholders) {
    const regex = new RegExp(`{{\\s*${placeholder}\\s*}}`, 'g');
    renderedContent = renderedContent.replace(regex, input[placeholder]);
  }

  const normalizedInputEntries = Object.entries(input).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  const deterministicHash = stableHash([
    template.templateId,
    template.version,
    template.body,
    normalizedInputEntries
  ]);

  return {
    renderedContent,
    deterministicHash
  };
}

function assertValidIsoDatetime(value: string, label: string): void {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`${label} must be a valid ISO-8601 datetime`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function pushAuditEntry(
  entriesByArtifactId: Map<string, ContentAuditEntry[]>,
  entry: ContentAuditEntry
): void {
  const existing = entriesByArtifactId.get(entry.artifactId) ?? [];
  entriesByArtifactId.set(entry.artifactId, [...existing, entry]);
}

export class InMemoryTemplateRegistry {
  private readonly templatesById = new Map<string, ContentTemplate[]>();

  registerTemplate(template: ContentTemplate): ContentTemplate {
    const templateId = normalizeText(template.templateId);
    const name = normalizeText(template.name);
    const body = template.body;

    if (!templateId) {
      throw new Error('template.templateId must be a non-empty string');
    }

    assertPositiveInteger(template.version, 'template.version');

    if (!name) {
      throw new Error('template.name must be a non-empty string');
    }

    if (typeof body !== 'string' || normalizeText(body) === '') {
      throw new Error('template.body must be a non-empty string');
    }

    if (!Array.isArray(template.requiredVariables) || template.requiredVariables.length === 0) {
      throw new Error('template.requiredVariables must be a non-empty array');
    }

    const requiredVariables = Array.from(
      new Set(
        template.requiredVariables.map((value) => {
          const normalized = normalizeText(value);
          if (!normalized) {
            throw new Error('template.requiredVariables must contain non-empty strings');
          }

          return normalized;
        })
      )
    );

    assertValidIsoDatetime(template.createdAt, 'template.createdAt');

    const normalizedTemplate: ContentTemplate = {
      ...template,
      templateId,
      name,
      body,
      requiredVariables,
      createdBy: normalizeText(template.createdBy),
      createdAt: new Date(Date.parse(template.createdAt)).toISOString()
    };

    const versions = this.templatesById.get(templateId) ?? [];
    if (versions.some((existing) => existing.version === normalizedTemplate.version)) {
      throw new Error(
        `template ${templateId} version ${normalizedTemplate.version} is already registered`
      );
    }

    const nextVersions = [...versions, normalizedTemplate].sort((left, right) =>
      left.version - right.version
    );

    this.templatesById.set(templateId, nextVersions);
    return normalizedTemplate;
  }

  getTemplate(templateId: string, version?: number): ContentTemplate | undefined {
    const versions = this.templatesById.get(templateId);
    if (!versions || versions.length === 0) {
      return undefined;
    }

    if (version === undefined) {
      return versions[versions.length - 1];
    }

    return versions.find((entry) => entry.version === version);
  }

  listTemplates(contentType?: ContentType): ContentTemplate[] {
    const allTemplates = Array.from(this.templatesById.values()).flat();
    if (!contentType) {
      return [...allTemplates];
    }

    return allTemplates.filter((template) => template.contentType === contentType);
  }
}

export class ContentApprovalPipeline {
  private readonly revisionsByArtifactId = new Map<string, ContentRevision[]>();
  private readonly auditEntriesByArtifactId = new Map<string, ContentAuditEntry[]>();

  constructor(private readonly templates: InMemoryTemplateRegistry) {}

  generateDraft(request: ContentGenerationRequest): ContentRevision {
    if (!isRecord(request.input)) {
      throw new Error('request.input must be an object');
    }

    const template = this.templates.getTemplate(request.templateId, request.templateVersion);
    if (!template) {
      throw new Error(
        `template not found: ${request.templateId}${
          request.templateVersion ? `@${request.templateVersion}` : ''
        }`
      );
    }

    assertValidIsoDatetime(request.requestedAt, 'request.requestedAt');

    const artifactId = normalizeText(request.artifactId);
    const campaignId = normalizeText(request.campaignId);
    const requestedBy = normalizeText(request.requestedBy);

    if (!artifactId) {
      throw new Error('request.artifactId must be a non-empty string');
    }

    if (!campaignId) {
      throw new Error('request.campaignId must be a non-empty string');
    }

    if (!requestedBy) {
      throw new Error('request.requestedBy must be a non-empty string');
    }

    const normalizedInput = normalizeInput(request.input);
    const { renderedContent, deterministicHash } = renderTemplateBody(template, normalizedInput);

    const revisions = this.revisionsByArtifactId.get(artifactId) ?? [];
    const revisionNumber = revisions.length + 1;

    const revision: ContentRevision = {
      artifactId,
      campaignId,
      revision: revisionNumber,
      state: 'draft',
      templateId: template.templateId,
      templateVersion: template.version,
      generatedBy: requestedBy,
      generatedAt: new Date(Date.parse(request.requestedAt)).toISOString(),
      input: normalizedInput,
      renderedContent,
      deterministicHash
    };

    this.revisionsByArtifactId.set(artifactId, [...revisions, revision]);
    pushAuditEntry(this.auditEntriesByArtifactId, {
      artifactId,
      revision: revisionNumber,
      action: 'draft_generated',
      actorId: requestedBy,
      at: revision.generatedAt,
      detail: `template=${template.templateId}@${template.version}`
    });

    return revision;
  }

  submitForReview(
    artifactId: string,
    revision: number,
    actorId: string,
    submittedAt: string
  ): ContentRevision {
    const target = this.mustFindRevision(artifactId, revision);
    if (target.state !== 'draft') {
      throw new Error(
        `Cannot submit revision ${revision} for review from state ${target.state}; expected draft`
      );
    }

    assertValidIsoDatetime(submittedAt, 'submittedAt');

    const actor = normalizeText(actorId);
    if (!actor) {
      throw new Error('actorId must be a non-empty string');
    }

    target.state = 'review';
    target.reviewSubmittedAt = new Date(Date.parse(submittedAt)).toISOString();
    target.reviewSubmittedBy = actor;

    pushAuditEntry(this.auditEntriesByArtifactId, {
      artifactId: target.artifactId,
      revision: target.revision,
      action: 'submitted_for_review',
      actorId: actor,
      at: target.reviewSubmittedAt
    });

    return { ...target };
  }

  approve(
    artifactId: string,
    revision: number,
    reviewerId: string,
    approvedAt: string,
    reviewerComment?: string
  ): ContentRevision {
    const target = this.mustFindRevision(artifactId, revision);
    if (target.state !== 'review') {
      throw new Error(`Cannot approve revision ${revision} from state ${target.state}; expected review`);
    }

    assertValidIsoDatetime(approvedAt, 'approvedAt');

    const reviewer = normalizeText(reviewerId);
    if (!reviewer) {
      throw new Error('reviewerId must be a non-empty string');
    }

    target.state = 'approved';
    target.reviewerId = reviewer;
    target.reviewerComment = reviewerComment ? normalizeText(reviewerComment) : undefined;
    target.reviewedAt = new Date(Date.parse(approvedAt)).toISOString();

    pushAuditEntry(this.auditEntriesByArtifactId, {
      artifactId: target.artifactId,
      revision: target.revision,
      action: 'approved',
      actorId: reviewer,
      at: target.reviewedAt,
      detail: target.reviewerComment
    });

    return { ...target };
  }

  reject(
    artifactId: string,
    revision: number,
    reviewerId: string,
    rejectedAt: string,
    reviewerComment: string
  ): ContentRevision {
    const target = this.mustFindRevision(artifactId, revision);
    if (target.state !== 'review') {
      throw new Error(`Cannot reject revision ${revision} from state ${target.state}; expected review`);
    }

    const comment = normalizeText(reviewerComment);
    if (!comment) {
      throw new Error('reviewerComment must be a non-empty string for rejection');
    }

    assertValidIsoDatetime(rejectedAt, 'rejectedAt');

    const reviewer = normalizeText(reviewerId);
    if (!reviewer) {
      throw new Error('reviewerId must be a non-empty string');
    }

    target.state = 'rejected';
    target.reviewerId = reviewer;
    target.reviewerComment = comment;
    target.reviewedAt = new Date(Date.parse(rejectedAt)).toISOString();

    pushAuditEntry(this.auditEntriesByArtifactId, {
      artifactId: target.artifactId,
      revision: target.revision,
      action: 'rejected',
      actorId: reviewer,
      at: target.reviewedAt,
      detail: comment
    });

    return { ...target };
  }

  reviseRejected(
    artifactId: string,
    rejectedRevision: number,
    request: {
      requestedBy: string;
      requestedAt: string;
      inputOverrides?: Record<string, string | number | boolean>;
      templateVersion?: number;
    }
  ): ContentRevision {
    const rejected = this.mustFindRevision(artifactId, rejectedRevision);
    if (rejected.state !== 'rejected') {
      throw new Error(
        `Cannot revise revision ${rejectedRevision} from state ${rejected.state}; expected rejected`
      );
    }

    const template = this.templates.getTemplate(rejected.templateId, request.templateVersion);
    if (!template) {
      throw new Error(
        `template not found for revision: ${rejected.templateId}${
          request.templateVersion ? `@${request.templateVersion}` : ''
        }`
      );
    }

    const mergedInput: Record<string, string | number | boolean> = {
      ...rejected.input,
      ...(request.inputOverrides ?? {})
    };

    this.generateDraft({
      artifactId: rejected.artifactId,
      campaignId: rejected.campaignId,
      templateId: rejected.templateId,
      templateVersion: template.version,
      requestedBy: request.requestedBy,
      requestedAt: request.requestedAt,
      input: mergedInput
    });

    const revisions = this.revisionsByArtifactId.get(rejected.artifactId);
    if (!revisions) {
      throw new Error(`artifact ${artifactId} not found after revision generation`);
    }

    const mutableNextRevision = revisions[revisions.length - 1];
    mutableNextRevision.revisedFromRevision = rejectedRevision;

    pushAuditEntry(this.auditEntriesByArtifactId, {
      artifactId: mutableNextRevision.artifactId,
      revision: mutableNextRevision.revision,
      action: 'revised',
      actorId: normalizeText(request.requestedBy),
      at: mutableNextRevision.generatedAt,
      detail: `revised_from=${rejectedRevision}`
    });

    return { ...mutableNextRevision };
  }

  listRevisions(artifactId: string): ContentRevision[] {
    return (this.revisionsByArtifactId.get(artifactId) ?? []).map((revision) => ({ ...revision }));
  }

  listAuditTrail(artifactId: string): ContentAuditEntry[] {
    return (this.auditEntriesByArtifactId.get(artifactId) ?? []).map((entry) => ({ ...entry }));
  }

  private mustFindRevision(artifactId: string, revisionNumber: number): ContentRevision {
    assertPositiveInteger(revisionNumber, 'revision');

    const revisions = this.revisionsByArtifactId.get(artifactId);
    if (!revisions || revisions.length === 0) {
      throw new Error(`artifact not found: ${artifactId}`);
    }

    const revision = revisions.find((entry) => entry.revision === revisionNumber);
    if (!revision) {
      throw new Error(`revision ${revisionNumber} not found for artifact ${artifactId}`);
    }

    return revision;
  }
}
