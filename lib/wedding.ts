export const styles = [
  { id: "garden", title: "The garden gathering", subtitle: "Wild florals. Soft light. A little magic.", tags: ["Romantic", "Botanical", "Intimate"], colors: ["#8c9b78", "#d8b5a4", "#efe3cf", "#bda56f"] },
  { id: "modern", title: "The modern romance", subtitle: "Clean lines with a warm, personal touch.", tags: ["Minimal", "Elegant", "Contemporary"], colors: ["#a58779", "#e6d9ce", "#635b53", "#c7b396"] },
  { id: "coastal", title: "The coastal celebration", subtitle: "Barefoot energy. Something blue.", tags: ["Airy", "Relaxed", "Natural"], colors: ["#8aa5aa", "#d6c7a8", "#f1e9db", "#6f817d"] },
] as const;

export const priorities = ["Beautiful food", "Flowers & styling", "Photography", "A lovely venue", "Music & atmosphere", "Keeping it intimate"];

export type WeddingBrief = {
  names: string;
  date: string;
  flexibleDate: boolean;
  location: string;
  guests: string;
  budget: string;
  keywords: string;
  style: string;
  priorities: string[];
  notes: string;
};

export const emptyBrief: WeddingBrief = {
  names: "", date: "", flexibleDate: true, location: "Singapore", guests: "80", budget: "20000",
  keywords: "", style: "garden", priorities: [], notes: "",
};

export function isWeddingBrief(value: unknown): value is WeddingBrief {
  if (!value || typeof value !== "object") return false;
  const brief = value as Record<string, unknown>;
  const strings = ["names", "date", "location", "guests", "budget", "keywords", "style", "notes"];
  return strings.every(key => typeof brief[key] === "string") &&
    typeof brief.flexibleDate === "boolean" &&
    Array.isArray(brief.priorities) && brief.priorities.every(item => typeof item === "string") &&
    styles.some(style => style.id === brief.style);
}

export function formatMoney(value: string) {
  return `S$${new Intl.NumberFormat("en-SG", { maximumFractionDigits: 0 }).format(Number(value))}`;
}
