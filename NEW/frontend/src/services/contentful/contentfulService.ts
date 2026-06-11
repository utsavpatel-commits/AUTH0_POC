import type { Document as RichTextDocument } from '@contentful/rich-text-types';
import { contentfulClient } from './contentfulClient';

/**
 * Content service for the headless-CMS demo.
 *
 * Strategy: prefer LIVE Contentful (delivery API) when configured; if the call
 * errors OR returns nothing, fall back to the bundled demo content so the demo
 * always renders a complete experience. Every getter is resilient.
 */

export interface MarketingPageContent {
  id: string;
  title: string;
  slug: string;
  eyebrow: string;
  heroTitle: string;
  heroDescription: string;
  heroImage: string | null;
  bodyHtml: string;
  highlights: string[];
  metrics: { label: string; value: string }[];
  ctaText: string;
  ctaLink: string;
  audience: string;
  state: string;
  icon: string; // lucide key resolved in the UI
}

export interface CmsDocumentContent {
  id: string;
  title: string;
  documentType: 'Policy' | 'Procedure' | 'Manual' | 'Asset' | string;
  ownerType: 'TCS' | 'Customer' | string;
  customerId: string;
  facilityId: string;
  department: string;
  category: string;
  vertical: string;
  state: string;
  audience: string;
  module: string;
  summary: string;
  updatedAt: string;
  version: number;
  editableContent: RichTextDocument | null;
  originalFileUrl: string | null;
}

export interface NewsArticleContent {
  id: string;
  title: string;
  summary: string;
  bodyHtml: string;
  publishDate: string;
  audience: string;
  state: string;
  tag: string;
}

function field<T>(fields: Record<string, unknown>, key: string, fallback: T): T {
  return (fields[key] as T | undefined) ?? fallback;
}

function assetUrl(asset: unknown): string | null {
  const file = (asset as { fields?: { file?: { url?: string } } } | undefined)?.fields?.file;
  if (!file?.url) return null;
  return file.url.startsWith('//') ? `https:${file.url}` : file.url;
}

function richTextToText(value: unknown): string {
  const content = (value as { content?: { content?: { value?: string }[] }[] } | null)?.content;
  return content?.flatMap((n) => n.content ?? []).map((n) => n.value).filter(Boolean).join(' ') || '';
}

// ---------------------------------------------------------------- demo content
const DEMO_MARKETING: MarketingPageContent[] = [
  {
    id: 'mp-platform', title: 'Platform Overview', slug: 'platform', icon: 'sparkles',
    eyebrow: 'The Compliance Store · Web 3.0',
    heroTitle: 'The compliance operating platform for long-term care.',
    heroDescription:
      'Survey readiness, learning management, and document control — unified on the deepest regulatory library in long-term care, with intelligence built in.',
    heroImage: null,
    bodyHtml:
      '<p>For 25 years, providers have trusted The Compliance Store for regulation-ready content. Web 3.0 turns that library into a connected platform — one source of truth that flows into every workflow your teams already run.</p>',
    highlights: [
      'A regulatory library maintained by compliance experts',
      'Policies that flow straight into staff training',
      'AI-assisted authoring that keeps facility versions current',
    ],
    metrics: [
      { label: 'Regulatory documents', value: '2,400+' },
      { label: 'Provider facilities', value: '5,000+' },
      { label: 'Years of expertise', value: '25' },
    ],
    ctaText: 'Request a walkthrough', ctaLink: '/login', audience: 'Administrator', state: '',
  },
  {
    id: 'mp-survey', title: 'Survey Readiness', slug: 'survey-readiness', icon: 'clipboard',
    eyebrow: 'Solution · Survey Readiness',
    heroTitle: 'Prepare for surveys with confidence.',
    heroDescription:
      'Mock surveys, CMS-2567 evidence, and plan-of-correction workflows built on current F-tag guidance — so the next visit is never a scramble.',
    heroImage: null,
    bodyHtml:
      '<p>Run mock surveys against the current Critical Element Pathways, capture findings with citations, and generate surveyor-ready evidence in a click.</p>',
    highlights: ['Critical Element Pathway runner', 'F-tag findings with citations', 'CMS-2567 + Plan of Correction export'],
    metrics: [{ label: 'Avg. prep time saved', value: '60%' }, { label: 'F-tags covered', value: '300+' }],
    ctaText: 'Explore Survey Readiness', ctaLink: '/login', audience: 'Administrator', state: 'AZ',
  },
  {
    id: 'mp-lms', title: 'Learning Management', slug: 'lms', icon: 'graduation',
    eyebrow: 'Solution · Learning Management',
    heroTitle: 'Training that stays current with policy.',
    heroDescription:
      'Assign, track, and certify staff training built directly from your compliance documents — no duplicate content, no version drift.',
    heroImage: null,
    bodyHtml:
      '<p>Every course is sourced from a Document Café policy or a curated video. When the policy updates, the training updates — automatically.</p>',
    highlights: ['Policy-sourced courses', 'Completion + certificate tracking', 'Auto re-acknowledgement on updates'],
    metrics: [{ label: 'Completion lift', value: '+28%' }, { label: 'Single source of truth', value: '100%' }],
    ctaText: 'Explore Learning Management', ctaLink: '/login', audience: 'DON', state: '',
  },
  {
    id: 'mp-cafe', title: 'Document Café', slug: 'document-cafe', icon: 'folder',
    eyebrow: 'Solution · Document Café',
    heroTitle: 'Your policy library, always survey-ready.',
    heroDescription:
      'Start from a TCS master policy, customize it for your facility, and keep it current as regulations change — with full version history and audit trail.',
    heroImage: null,
    bodyHtml:
      '<p>The Document Café pairs the TCS source library with inline authoring. Customize a master policy into a facility version; when TCS publishes an update, reconcile the changes with AI assistance.</p>',
    highlights: ['TCS source library + facility versions', 'Inline authoring with approval workflow', 'AI-assisted reconcile on source updates'],
    metrics: [{ label: 'Policies & templates', value: '64' }, { label: 'Libraries', value: '2' }],
    ctaText: 'Explore Document Café', ctaLink: '/login', audience: 'Administrator', state: '',
  },
];

const DEMO_DOCS: CmsDocumentContent[] = [
  d('Pressure Ulcer Prevention Policy', 'Policy', 'TCS', '', '', 'Clinical', 'Skin & Wound', 'SNF', 'AZ', 'DON', 'Document Café', 'Evidence-based prevention and staging protocol aligned to F686.', 3),
  d('Infection Control Program', 'Procedure', 'TCS', '', '', 'Nursing', 'Infection Control', 'SNF', 'TX', 'Nurse', 'Document Café', 'Facility-wide IPC program covering surveillance and outbreak response.', 2),
  d('Abuse & Neglect Prevention Manual', 'Manual', 'TCS', '', '', 'Administration', 'Resident Rights', 'SNF', 'CA', 'Administrator', 'LMS', 'Reporting, investigation, and prevention guidance for F600–F610.', 1),
  d('Hand Hygiene Competency Checklist', 'Asset', 'TCS', '', '', 'Nursing', 'Infection Control', 'SNF', '', 'Nurse', 'LMS', 'Printable competency checklist for direct-care staff.', 1),
  d('Emergency Preparedness Plan', 'Manual', 'Customer', 'ABC Health', 'Phoenix', 'Nursing', 'Emergency Preparedness', 'SNF', 'AZ', 'Administrator', 'Document Café', 'Phoenix facility all-hazards plan, customized from the TCS master.', 4),
  d('Medication Administration Policy', 'Policy', 'Customer', 'ABC Health', 'Phoenix', 'Clinical', 'Clinical', 'SNF', 'AZ', 'DON', 'Document Café', 'Facility med-pass policy with state overlay for Arizona.', 2),
  d('Resident Rights & Dignity Policy', 'Policy', 'Customer', 'Bayview Care', 'San Diego', 'Administration', 'Resident Rights', 'SNF', 'CA', 'Administrator', 'Document Café', 'Facility resident-rights policy aligned to California Title 22.', 1),
  d('QAPI Plan Template', 'Asset', 'TCS', '', '', 'Administration', 'QAPI', 'SNF', '', 'Administrator', 'Document Café', 'Editable QAPI plan template with performance-improvement worksheets.', 1),
];

function d(
  title: string, documentType: string, ownerType: string, customerId: string, facilityId: string,
  department: string, category: string, vertical: string, state: string, audience: string,
  module: string, summary: string, version: number,
): CmsDocumentContent {
  const asset = documentType === 'Asset';
  return {
    id: 'doc-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title, documentType, ownerType, customerId, facilityId, department, category, vertical, state,
    audience, module, summary, version,
    updatedAt: new Date(Date.now() - version * 8 * 864e5).toISOString().slice(0, 10),
    editableContent: null,
    originalFileUrl: asset ? `#/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf` : null,
  };
}

const DEMO_NEWS: NewsArticleContent[] = [
  n('Arizona Regulatory Update', 'Regulatory', 'AZ', 'DON', 'New Arizona guidance affects infection-control surveillance requirements for SNFs.',
    '<p>Arizona has issued updated guidance on respiratory pathogen surveillance. TCS source policies have been revised — review and reconcile your facility versions.</p>'),
  n('2026 CMS Pressure Injury Guidance', 'Regulatory', '', 'DON', 'CMS clarifies staging documentation expectations under F686.',
    '<p>Updated interpretive guidance changes how staging and treatment must be documented. The Pressure Ulcer Prevention Policy has been updated in the TCS library.</p>'),
  n('New: Policy-sourced training', 'Product', '', 'Administrator', 'LMS courses can now be built directly from Document Café policies.',
    '<p>Training content now references the canonical Café document, so courses stay current as the source policy evolves.</p>'),
  n('Antibiotic Stewardship Toolkit released', 'Product', '', 'Nurse', 'A new Tools & Templates toolkit is available in the TCS library.',
    '<p>The Antibiotic Stewardship Toolkit adds weekly review worksheets and an indication/stop-date tracker.</p>'),
];

function n(title: string, tag: string, state: string, audience: string, summary: string, bodyHtml: string): NewsArticleContent {
  return {
    id: 'news-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title, tag, state, audience, summary, bodyHtml,
    publishDate: new Date().toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------- live + fallback
async function live<T>(fn: () => Promise<T[]>, demo: T[]): Promise<T[]> {
  if (!contentfulClient) return demo;
  try {
    const res = await fn();
    // Use live content once the space is fully seeded; until then keep the rich
    // bundled set so the demo always looks complete (run `npm run setup-contentful`
    // to publish the full content and flip every surface to live).
    return res.length >= demo.length ? res : demo;
  } catch {
    return demo;
  }
}

export async function getMarketingPages(): Promise<MarketingPageContent[]> {
  return live(async () => {
    const res = await contentfulClient!.getEntries({ content_type: 'marketingPage', order: ['fields.title'] });
    return res.items.map((item): MarketingPageContent => {
      const f = item.fields as Record<string, unknown>;
      return {
        id: item.sys.id,
        title: field(f, 'title', ''), slug: field(f, 'slug', ''), eyebrow: field(f, 'eyebrow', ''),
        heroTitle: field(f, 'heroTitle', ''), heroDescription: field(f, 'heroDescription', ''),
        heroImage: assetUrl(f.heroImage),
        bodyHtml: field(f, 'bodyHtml', '') || `<p>${richTextToText(f.body)}</p>`,
        highlights: field(f, 'highlights', [] as string[]),
        metrics: field(f, 'metrics', [] as { label: string; value: string }[]),
        ctaText: field(f, 'ctaText', ''), ctaLink: field(f, 'ctaLink', '/login'),
        audience: field(f, 'audience', ''), state: field(f, 'state', ''), icon: field(f, 'icon', 'sparkles'),
      };
    });
  }, DEMO_MARKETING);
}

export async function getMarketingPage(slug: string): Promise<MarketingPageContent | null> {
  const pages = await getMarketingPages();
  return pages.find((p) => p.slug === slug) ?? null;
}

export async function getDocuments(): Promise<CmsDocumentContent[]> {
  return live(async () => {
    const res = await contentfulClient!.getEntries({ content_type: 'document', order: ['fields.title'], include: 1 });
    return res.items.map((item): CmsDocumentContent => {
      const f = item.fields as Record<string, unknown>;
      return {
        id: item.sys.id,
        title: field(f, 'title', ''), documentType: field(f, 'documentType', ''), ownerType: field(f, 'ownerType', ''),
        customerId: field(f, 'customerId', ''), facilityId: field(f, 'facilityId', ''), department: field(f, 'department', ''),
        category: field(f, 'category', ''), vertical: field(f, 'vertical', ''), state: field(f, 'state', ''),
        audience: field(f, 'audience', ''), module: field(f, 'module', ''),
        summary: field(f, 'summary', '') || richTextToText(f.editableContent).slice(0, 160),
        updatedAt: (item.sys.updatedAt || '').slice(0, 10), version: 1,
        editableContent: field(f, 'editableContent', null), originalFileUrl: assetUrl(f.originalFile),
      };
    });
  }, DEMO_DOCS);
}

export async function getCustomerDocuments(): Promise<CmsDocumentContent[]> {
  return (await getDocuments()).filter((doc) => doc.ownerType === 'Customer');
}

export async function getNewsArticles(): Promise<NewsArticleContent[]> {
  return live(async () => {
    const res = await contentfulClient!.getEntries({ content_type: 'newsArticle', order: ['-fields.publishDate'] });
    return res.items.map((item): NewsArticleContent => {
      const f = item.fields as Record<string, unknown>;
      return {
        id: item.sys.id,
        title: field(f, 'title', ''), summary: field(f, 'summary', ''),
        bodyHtml: field(f, 'bodyHtml', '') || `<p>${richTextToText(f.body)}</p>`,
        publishDate: field(f, 'publishDate', ''), audience: field(f, 'audience', ''), state: field(f, 'state', ''),
        tag: field(f, 'tag', 'Update'),
      };
    });
  }, DEMO_NEWS);
}
