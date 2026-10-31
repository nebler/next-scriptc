import { POST } from '../../demo/app/api/login-scrypt/route.ts';
import { printResponse } from './print.ts';

async function main() {
  const bodies = [
    JSON.stringify({ email: ' ADA@example.com ', password: 'correct horse battery staple' }),
    JSON.stringify({ email: 'ada@example.com', password: 'wrong password' }),
    JSON.stringify({ email: 'missing@example.com', password: 'correct horse battery staple' }),
    '{', 'null', '[]',
    JSON.stringify({ email: 42, password: 'password' }),
    JSON.stringify({ email: 'ada@example.com' }),
    JSON.stringify({ email: 'ada@example.com', password: '' }),
    JSON.stringify({ email: 'ada@example.com', password: 'é'.repeat(37) }),
    JSON.stringify({ email: 'ada@example.com', password: 'é'.repeat(513) }),
  ];
  for (let i = 0; i < bodies.length; i++) {
    await printResponse(String(i), await POST(new Request('http://probe.test/api/login-scrypt', { method: 'POST', body: bodies[i] })));
  }
}
main();
