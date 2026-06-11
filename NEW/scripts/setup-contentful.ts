import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from 'contentful-management';

const here = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] != null) continue;
    process.env[key] = raw.replace(/^['\"]|['\"]$/g, '');
  }
}

// Support both direct execution from repo root and the frontend npm script.
loadEnvFile(resolve(here, '../.env'));
loadEnvFile(resolve(here, '../frontend/.env.local'));
loadEnvFile(resolve(process.cwd(), '.env'));
loadEnvFile(resolve(process.cwd(), '.env.local'));

const spaceId = process.env.CONTENTFUL_SPACE_ID || process.env.VITE_CONTENTFUL_SPACE_ID;
const environmentId = process.env.CONTENTFUL_ENVIRONMENT || process.env.VITE_CONTENTFUL_ENVIRONMENT || 'master';
const managementToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN;

if (!spaceId || !managementToken) {
  console.error('Missing CONTENTFUL_SPACE_ID/VITE_CONTENTFUL_SPACE_ID or CONTENTFUL_MANAGEMENT_TOKEN. CONTENTFUL_ENVIRONMENT defaults to master.');
  process.exit(1);
}

type FieldDef = {
  id: string;
  name: string;
  type: string;
  required?: boolean;
  localized?: boolean;
  linkType?: string;
  items?: Record<string, unknown>;
  validations?: Record<string, unknown>[];
};

const richText = (text: string) => ({
  nodeType: 'document',
  data: {},
  content: [
    {
      nodeType: 'paragraph',
      data: {},
      content: [{ nodeType: 'text', value: text, marks: [], data: {} }],
    },
  ],
});

const contentTypes = [
  {
    id: 'marketingPage',
    name: 'Marketing Page',
    description: 'Marketing pages authored in Contentful and consumed by Web 3.0.',
    displayField: 'title',
    fields: [
      { id: 'title', name: 'Title', type: 'Symbol', required: true },
      { id: 'slug', name: 'Slug', type: 'Symbol', required: true },
      { id: 'heroTitle', name: 'Hero Title', type: 'Symbol' },
      { id: 'heroDescription', name: 'Hero Description', type: 'Text' },
      { id: 'heroImage', name: 'Hero Image', type: 'Link', linkType: 'Asset' },
      { id: 'eyebrow', name: 'Eyebrow', type: 'Symbol' },
      { id: 'body', name: 'Body', type: 'RichText' },
      { id: 'bodyHtml', name: 'Body HTML', type: 'Text' },
      { id: 'highlights', name: 'Highlights', type: 'Array', items: { type: 'Symbol' } },
      { id: 'metrics', name: 'Metrics', type: 'Object' },
      { id: 'icon', name: 'Icon', type: 'Symbol' },
      { id: 'ctaText', name: 'CTA Text', type: 'Symbol' },
      { id: 'ctaLink', name: 'CTA Link', type: 'Symbol' },
      { id: 'audience', name: 'Audience', type: 'Symbol' },
      { id: 'state', name: 'State', type: 'Symbol' },
    ] satisfies FieldDef[],
  },
  {
    id: 'document',
    name: 'Document',
    description: 'CMS/DMS documents with metadata consumed by Web 3.0.',
    displayField: 'title',
    fields: [
      { id: 'title', name: 'Title', type: 'Symbol', required: true },
      { id: 'documentType', name: 'Document Type', type: 'Symbol', validations: [{ in: ['Policy', 'Procedure', 'Manual', 'Asset'] }] },
      { id: 'ownerType', name: 'Owner Type', type: 'Symbol', validations: [{ in: ['TCS', 'Customer'] }] },
      { id: 'customerId', name: 'Customer ID', type: 'Symbol' },
      { id: 'facilityId', name: 'Facility ID', type: 'Symbol' },
      { id: 'department', name: 'Department', type: 'Symbol' },
      { id: 'category', name: 'Category', type: 'Symbol' },
      { id: 'vertical', name: 'Vertical', type: 'Symbol' },
      { id: 'state', name: 'State', type: 'Symbol' },
      { id: 'audience', name: 'Audience', type: 'Symbol' },
      { id: 'module', name: 'Module', type: 'Symbol' },
      { id: 'summary', name: 'Summary', type: 'Text' },
      { id: 'editableContent', name: 'Editable Content', type: 'RichText' },
      { id: 'originalFile', name: 'Original File', type: 'Link', linkType: 'Asset' },
    ] satisfies FieldDef[],
  },
  {
    id: 'newsArticle',
    name: 'News Article',
    description: 'Regulatory and product updates authored in Contentful.',
    displayField: 'title',
    fields: [
      { id: 'title', name: 'Title', type: 'Symbol', required: true },
      { id: 'summary', name: 'Summary', type: 'Text' },
      { id: 'body', name: 'Body', type: 'RichText' },
      { id: 'bodyHtml', name: 'Body HTML', type: 'Text' },
      { id: 'tag', name: 'Tag', type: 'Symbol' },
      { id: 'publishDate', name: 'Publish Date', type: 'Date' },
      { id: 'audience', name: 'Audience', type: 'Symbol' },
      { id: 'state', name: 'State', type: 'Symbol' },
    ] satisfies FieldDef[],
  },
];

const today = new Date().toISOString().slice(0, 10);
const slugId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function marketing(slug: string, icon: string, eyebrow: string, heroTitle: string, heroDescription: string,
  bodyHtml: string, highlights: string[], metrics: { label: string; value: string }[], ctaText: string,
  ctaLink: string, audience: string, state: string, title: string) {
  return {
    id: `mp-${slug}`, contentType: 'marketingPage',
    fields: { title, slug, icon, eyebrow, heroTitle, heroDescription, body: richText(heroDescription),
      bodyHtml, highlights, metrics, ctaText, ctaLink, audience, state },
  };
}

function document(title: string, documentType: string, ownerType: string, customerId: string, facilityId: string,
  department: string, category: string, vertical: string, state: string, audience: string, module: string, summary: string) {
  return {
    id: `doc-${slugId(title)}`, contentType: 'document',
    fields: { title, documentType, ownerType, customerId, facilityId, department, category, vertical, state,
      audience, module, summary, editableContent: richText(summary) },
  };
}

function news(title: string, tag: string, state: string, audience: string, summary: string, bodyHtml: string) {
  return {
    id: `news-${slugId(title)}`, contentType: 'newsArticle',
    fields: { title, tag, state, audience, summary, bodyHtml, body: richText(summary), publishDate: today },
  };
}

const entries = [
  marketing('platform', 'sparkles', 'The Compliance Store · Web 3.0', 'The compliance operating platform for long-term care.',
    'Survey readiness, learning management, and document control — unified on the deepest regulatory library in long-term care, with intelligence built in.',
    '<p>For 25 years, providers have trusted The Compliance Store for regulation-ready content. Web 3.0 turns that library into a connected platform — one source of truth that flows into every workflow your teams already run.</p>',
    ['A regulatory library maintained by compliance experts', 'Policies that flow straight into staff training', 'AI-assisted authoring that keeps facility versions current'],
    [{ label: 'Regulatory documents', value: '2,400+' }, { label: 'Provider facilities', value: '5,000+' }, { label: 'Years of expertise', value: '25' }],
    'Request a walkthrough', '/login', 'Administrator', '', 'Platform Overview'),
  marketing('survey-readiness', 'clipboard', 'Solution · Survey Readiness', 'Prepare for surveys with confidence.',
    'Mock surveys, CMS-2567 evidence, and plan-of-correction workflows built on current F-tag guidance — so the next visit is never a scramble.',
    '<p>Run mock surveys against the current Critical Element Pathways, capture findings with citations, and generate surveyor-ready evidence in a click.</p>',
    ['Critical Element Pathway runner', 'F-tag findings with citations', 'CMS-2567 + Plan of Correction export'],
    [{ label: 'Avg. prep time saved', value: '60%' }, { label: 'F-tags covered', value: '300+' }],
    'Explore Survey Readiness', '/login', 'Administrator', 'AZ', 'Survey Readiness'),
  marketing('lms', 'graduation', 'Solution · Learning Management', 'Training that stays current with policy.',
    'Assign, track, and certify staff training built directly from your compliance documents — no duplicate content, no version drift.',
    '<p>Every course is sourced from a Document Café policy or a curated video. When the policy updates, the training updates — automatically.</p>',
    ['Policy-sourced courses', 'Completion + certificate tracking', 'Auto re-acknowledgement on updates'],
    [{ label: 'Completion lift', value: '+28%' }, { label: 'Single source of truth', value: '100%' }],
    'Explore Learning Management', '/login', 'DON', '', 'Learning Management'),
  marketing('document-cafe', 'folder', 'Solution · Document Café', "Your policy library, always survey-ready.",
    'Start from a TCS master policy, customize it for your facility, and keep it current as regulations change — with full version history and audit trail.',
    '<p>The Document Café pairs the TCS source library with inline authoring. Customize a master policy into a facility version; when TCS publishes an update, reconcile the changes with AI assistance.</p>',
    ['TCS source library + facility versions', 'Inline authoring with approval workflow', 'AI-assisted reconcile on source updates'],
    [{ label: 'Policies & templates', value: '64' }, { label: 'Libraries', value: '2' }],
    'Explore Document Café', '/login', 'Administrator', '', 'Document Café'),

  document('Pressure Ulcer Prevention Policy', 'Policy', 'TCS', '', '', 'Clinical', 'Skin & Wound', 'SNF', 'AZ', 'DON', 'Document Café', 'Evidence-based prevention and staging protocol aligned to F686.'),
  document('Infection Control Program', 'Procedure', 'TCS', '', '', 'Nursing', 'Infection Control', 'SNF', 'TX', 'Nurse', 'Document Café', 'Facility-wide IPC program covering surveillance and outbreak response.'),
  document('Abuse & Neglect Prevention Manual', 'Manual', 'TCS', '', '', 'Administration', 'Resident Rights', 'SNF', 'CA', 'Administrator', 'LMS', 'Reporting, investigation, and prevention guidance for F600–F610.'),
  document('Hand Hygiene Competency Checklist', 'Asset', 'TCS', '', '', 'Nursing', 'Infection Control', 'SNF', '', 'Nurse', 'LMS', 'Printable competency checklist for direct-care staff.'),
  document('Emergency Preparedness Plan', 'Manual', 'Customer', 'ABC Health', 'Phoenix', 'Nursing', 'Emergency Preparedness', 'SNF', 'AZ', 'Administrator', 'Document Café', 'Phoenix facility all-hazards plan, customized from the TCS master.'),
  document('Medication Administration Policy', 'Policy', 'Customer', 'ABC Health', 'Phoenix', 'Clinical', 'Clinical', 'SNF', 'AZ', 'DON', 'Document Café', 'Facility med-pass policy with state overlay for Arizona.'),
  document('Resident Rights & Dignity Policy', 'Policy', 'Customer', 'Bayview Care', 'San Diego', 'Administration', 'Resident Rights', 'SNF', 'CA', 'Administrator', 'Document Café', 'Facility resident-rights policy aligned to California Title 22.'),
  document('QAPI Plan Template', 'Asset', 'TCS', '', '', 'Administration', 'QAPI', 'SNF', '', 'Administrator', 'Document Café', 'Editable QAPI plan template with performance-improvement worksheets.'),

  news('Arizona Regulatory Update', 'Regulatory', 'AZ', 'DON', 'New Arizona guidance affects infection-control surveillance requirements for SNFs.',
    '<p>Arizona has issued updated guidance on respiratory pathogen surveillance. TCS source policies have been revised — review and reconcile your facility versions.</p>'),
  news('2026 CMS Pressure Injury Guidance', 'Regulatory', '', 'DON', 'CMS clarifies staging documentation expectations under F686.',
    '<p>Updated interpretive guidance changes how staging and treatment must be documented. The Pressure Ulcer Prevention Policy has been updated in the TCS library.</p>'),
  news('New: Policy-sourced training', 'Product', '', 'Administrator', 'LMS courses can now be built directly from Document Café policies.',
    '<p>Training content now references the canonical Café document, so courses stay current as the source policy evolves.</p>'),
  news('Antibiotic Stewardship Toolkit released', 'Product', '', 'Nurse', 'A new Tools & Templates toolkit is available in the TCS library.',
    '<p>The Antibiotic Stewardship Toolkit adds weekly review worksheets and an indication/stop-date tracker.</p>'),
];

function localized(fields: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { 'en-US': value }]));
}

async function getOrCreateContentType(env: any, def: (typeof contentTypes)[number]) {
  try {
    const existing = await env.getContentType(def.id);
    existing.name = def.name;
    existing.description = def.description;
    existing.displayField = def.displayField;
    const byId = new Map(existing.fields.map((field: FieldDef) => [field.id, field]));
    for (const field of def.fields) {
      const current = byId.get(field.id);
      if (current) Object.assign(current, field);
      else existing.fields.push({ localized: false, required: false, omitted: false, disabled: false, ...field });
    }
    return existing.update();
  } catch (error: any) {
    if (error?.name !== 'NotFound' && error?.sys?.id !== 'NotFound') throw error;
    return env.createContentTypeWithId(def.id, {
      name: def.name,
      description: def.description,
      displayField: def.displayField,
      fields: def.fields.map((field) => ({ localized: false, required: false, omitted: false, disabled: false, ...field })),
    });
  }
}

async function publishContentType(contentType: any) {
  const latest = await contentType.update().catch(() => contentType);
  if (!latest.isPublished() || latest.sys.publishedVersion !== latest.sys.version - 1) {
    return latest.publish();
  }
  return latest;
}

async function getOrCreateEntry(env: any, item: (typeof entries)[number]) {
  const payload = { fields: localized(item.fields) };
  try {
    const existing = await env.getEntry(item.id);
    existing.fields = payload.fields;
    return existing.update();
  } catch (error: any) {
    if (error?.name !== 'NotFound' && error?.sys?.id !== 'NotFound') throw error;
    return env.createEntryWithId(item.contentType, item.id, payload);
  }
}

async function publishEntry(entry: any) {
  if (!entry.isPublished() || entry.sys.publishedVersion !== entry.sys.version - 1) {
    return entry.publish();
  }
  return entry;
}

async function main() {
  const client = createClient({ accessToken: managementToken! });
  const space = await client.getSpace(spaceId!);
  const env = await space.getEnvironment(environmentId);

  for (const def of contentTypes) {
    const ct = await getOrCreateContentType(env, def);
    await publishContentType(ct);
    console.log(`Content type ready: ${def.name}`);
  }

  for (const item of entries) {
    const entry = await getOrCreateEntry(env, item);
    await publishEntry(entry);
    console.log(`Entry ready: ${item.id}`);
  }

  console.log('Contentful setup complete. Models and demo content are safe to re-run.');
}

function contentfulErrorSummary(error: any) {
  let message = error?.message || String(error);
  let status = error?.status;
  let requestId = error?.requestId;
  if (typeof message === 'string' && message.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(message);
      message = parsed.message || message;
      status = status || parsed.status;
      requestId = requestId || parsed.requestId;
    } catch {
      message = message.replace(/\"Authorization\":\s*\"Bearer [^\"]+\"/g, '\"Authorization\": \"Bearer [redacted]\"');
    }
  }
  return `${status ? `(${status}) ` : ''}${message}${requestId ? ` requestId=${requestId}` : ''}`;
}

main().catch((error) => {
  console.error(`Contentful setup failed: ${contentfulErrorSummary(error)}`);
  process.exit(1);
});
