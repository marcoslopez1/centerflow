// Client-safe connector catalog. No secrets here.
export type ConnectorKind = "oauth" | "token";

export interface ConnectorField {
  name: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  help?: string;
}

export interface ConnectorDef {
  id: string;
  name: string;
  description: string;
  kind: ConnectorKind;
  brand: string; // short monogram shown on cards
  fields?: ConnectorField[];
  docsUrl?: string;
}

export const CONNECTORS: ConnectorDef[] = [
  {
    id: "jira",
    name: "Jira",
    description: "Issues assigned to you, grouped by their workflow status.",
    kind: "token",
    brand: "J",
    docsUrl: "https://id.atlassian.com/manage-profile/security/api-tokens",
    fields: [
      { name: "site", label: "Jira site", placeholder: "your-team.atlassian.net" },
      { name: "email", label: "Atlassian email", placeholder: "you@company.com" },
      {
        name: "token",
        label: "API token",
        secret: true,
        help: "Create one in your Atlassian account → Security → API tokens.",
      },
    ],
  },
  {
    id: "microsoft_outlook",
    name: "Outlook",
    description: "Flagged emails and upcoming calendar events.",
    kind: "oauth",
    brand: "O",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Recently edited pages you shared with the app.",
    kind: "oauth",
    brand: "N",
  },
];

export const SOURCE_LABEL: Record<string, string> = {
  manual: "Personal",
  jira: "Jira",
  microsoft_outlook: "Outlook",
  notion: "Notion",
};

export type TaskStatus = "now" | "soon" | "done";
export const STATUSES: { id: TaskStatus; label: string; hint: string }[] = [
  { id: "now", label: "Now", hint: "In progress or happening today" },
  { id: "soon", label: "Soon", hint: "Up next" },
  { id: "done", label: "Done", hint: "Completed" },
];

export const AI_PROVIDERS = [
  { id: "lovable", label: "Built-in AI", needsKey: false, defaultModel: "openai/gpt-6-astra" },
  { id: "openai", label: "OpenAI (your key)", needsKey: true, defaultModel: "gpt-5" },
  { id: "anthropic", label: "Anthropic (your key)", needsKey: true, defaultModel: "claude-sonnet-4-5" },
] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number]["id"];
