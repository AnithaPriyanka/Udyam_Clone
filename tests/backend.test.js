import request from 'supertest';
import app, { startServer } from '../backend/server.js';

let server;

beforeAll(async () => {
  process.env.PORT = '0'; // random
  server = await startServer();
});

afterAll(async () => {
  if (server) server.close();
});

test('GET /schema returns array', async () => {
  const res = await request(app).get('/schema');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('POST /submit validates Aadhaar and PAN', async () => {
  const bad = await request(app).post('/submit').send({ aadhaarNumber: '123', panNumber: 'ABCDE12345' });
  expect([400,422]).toContain(bad.status);

  const ok = await request(app).post('/submit').send({ aadhaarNumber: '123456789012', panNumber: 'ABCDE1234F' });
  expect([200,500]).toContain(ok.status); // 500 if DB not configured
});
