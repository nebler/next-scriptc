import dayjs from 'dayjs';
import { intersect } from './entry.ts';
console.log(JSON.stringify(intersect([[{start:dayjs('2026-01-01'),end:dayjs('2026-01-02')}],[{start:dayjs('2026-01-01'),end:dayjs('2026-01-03')}]])));
