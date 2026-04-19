export type AIChatMessage = {
  role: "user" | "assistant" | "system" | "developer";
  body: string;
};

export const OpenRouterModerationCategories = {
  spam: "Unsolicited, repetitive, or irrelevant content.",
  hate: "Content expressing or promoting hate or discrimination against a group or individual.",
  harassment: "Targeted insults, bullying, or intimidation.",
  self_harm:
    "Expressions, encouragement, or instructions of self-injury or suicide.",
  sexual: "Sexual or pornographic content, including explicit roleplay.",
  sexual_minors: "Any sexual content involving minors.",
  violence: "Threats or depictions of physical harm or aggression.",
  graphic_content:
    "Highly explicit descriptions of violence, gore, or sexual acts.",
  criminal_activity: "Promotion or instruction of illegal activities.",
  extremism: "Advocacy or recruitment for extremist or terrorist causes.",
  drugs: "Discussion or promotion of illegal or controlled substances.",
  impersonation: "Pretending to be another person, entity, or the system.",
  malicious_input:
    "Attempts to exploit or manipulate system behavior via crafted input (e.g., prompt injection, code injection).",
  system_abuse:
    "Actions aimed at disrupting, crashing, or exploiting the system.",
  evasion: "Attempts to bypass safety filters or moderation controls.",
} as const;

export type TOpenRouterModerationCategory =
  keyof typeof OpenRouterModerationCategories;

export type TOpenRouterModerationScores = Record<
  TOpenRouterModerationCategory,
  number
>;

export type TOpenRouterModerationResult = {
  flagged: boolean;
  scores: TOpenRouterModerationScores;
};
