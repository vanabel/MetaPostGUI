export type ExampleExpect = {
  compile?: string;
  parse_coverage_min?: number;
  canvas_sync?: string;
};

export type ExampleEntry = {
  id: string;
  title: string;
  description?: string;
  source: string;
  source_url?: string;
  category: string;
  tier: string;
  figure?: string;
  mpostdef?: string;
  mposttex?: string;
  plugins?: string[];
  tags?: string[];
  features?: string[];
  featured_level?: "basic" | "intermediate" | "advanced";
  featured_order?: number;
  featured_reason?: string;
  expect?: ExampleExpect;
};

export type ExamplesListResponse = {
  examples: ExampleEntry[];
  total: number;
};
