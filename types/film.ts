export interface Film {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  episodes?: Episode[];
  _count?: { episodes: number };
}

import type { Episode } from "./episode";
