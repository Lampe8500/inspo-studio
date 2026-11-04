// Delte typer mellem server (capture/generate) og klient (lærred/moodboard).

export type Rect = { x: number; y: number; w: number; h: number };

export type ElementStyles = {
  color: string;
  backgroundColor: string;
  backgroundImage: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  textTransform: string;
  padding: string;
  borderRadius: string;
  border: string;
  boxShadow: string;
  display: string;
  flexDirection: string;
  gridTemplateColumns: string;
  gap: string;
  textAlign: string;
};

export type Role =
  | "header"
  | "nav"
  | "hero"
  | "section"
  | "card"
  | "button"
  | "heading"
  | "image"
  | "form"
  | "list"
  | "footer"
  | "text"
  | "block";

export type CapturedElement = {
  i: number;
  tag: string;
  role: Role;
  rect: Rect;
  depth: number;
  text: string;
  children: string;
  styles: ElementStyles;
};

export type Token = { value: string; weight: number };

export type CaptureMeta = {
  id: string;
  url: string;
  host: string;
  title: string;
  description: string;
  capturedAt: string;
  width: number;
  height: number;
  /** true hvis siden var længere end vi tager screenshot af */
  truncated: boolean;
  colors: Token[];
  fonts: Token[];
  elements: CapturedElement[];
};

export type Aspect = "layout" | "farver" | "typografi";

export type PickRole =
  | "Menu"
  | "Hero"
  | "Sektion"
  | "Kort"
  | "Knap"
  | "Footer"
  | "Formular"
  | "Typografi"
  | "Farver"
  | "Andet";

export type Pick = {
  id: string;
  captureId: string;
  elementIndex: number;
  rect: Rect;
  role: PickRole;
  aspects: Aspect[];
  note: string;
};

export type BoardPlacement = { captureId: string; x: number; y: number };

export type PageVersion = {
  id: string;
  createdAt: string;
  instruction: string;
  html: string;
};

export type Project = {
  boards: BoardPlacement[];
  picks: Pick[];
  brief: string;
  language: "da" | "en";
  followOrder: boolean;
  versions: PageVersion[];
};

export const emptyProject = (): Project => ({
  boards: [],
  picks: [],
  brief: "",
  language: "da",
  followOrder: true,
  versions: [],
});

/** Det klienten sender til /api/generate for hver valgt bid */
export type GeneratePick = {
  role: PickRole;
  aspects: Aspect[];
  note: string;
  host: string;
  tag: string;
  text: string;
  children: string;
  styles: ElementStyles;
  size: { w: number; h: number };
  /** JPEG som base64 (uden data:-præfiks) */
  image: string;
};

export type GenerateRequest = {
  brief: string;
  language: "da" | "en";
  followOrder: boolean;
  picks: GeneratePick[];
  sites: { host: string; colors: Token[]; fonts: Token[] }[];
  /** Ved rettelser: den nuværende side og hvad der skal ændres */
  refine?: { html: string; instruction: string };
};

/** Linjer i NDJSON-strømmen fra /api/generate */
export type GenerateEvent =
  | { t: "delta"; v: string }
  | { t: "done"; stop: string | null; model: string }
  | { t: "error"; message: string };
