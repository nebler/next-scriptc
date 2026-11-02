import type {InlineConfig} from 'vite';
import type {PromotionOptions} from './vite.mjs';
// Structural hook types avoid resolving optional Astro from this package.
export interface AstroPromotionIntegration {
 name: string;
 hooks: {
  'astro:config:done': (context: {config: {output: string; srcDir: URL; adapter?: {name: string} | null}}) => void;
  'astro:build:setup': (context: {target: 'client' | 'server'; updateConfig: (config: InlineConfig) => void}) => void;
 };
}
export function scriptcAstro(options?: PromotionOptions): AstroPromotionIntegration;
export default scriptcAstro;
