import type {Plugin} from 'vite';
export interface PromotionOptions {
 sourceDir?: string;
 tsconfig?: string;
 report?: (message: string) => void;
 build?: {
  linux?: boolean;
  target?: string;
  timing?: boolean;
  constructionResults?: boolean;
  catchFallback?: boolean;
  runtime?: string;
  headers?: string;
 };
}
export function scriptcPromote(options?: PromotionOptions): Plugin;
export default scriptcPromote;
