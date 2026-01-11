import request from 'supertest';
import express, { Express } from 'express';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { FileStorageService } from '../../server/src/data/FileStorageService';
import { SessionManager } from '../../server/src/services/SessionManager';
import { createApp } from '../../server/src/app';

describe('API Routes', () => {
  let app: Express;
  let testDir: string;
  let storage: FileStorageService;
  let sessionManager: SessionManager;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `test-api-${Date.now()}`);
    await fs.ensureDir(testDir);
    storage = new FileStorageService(testDir);
    sessionManager = new SessionManager(storage);
    app = createApp(storage, sessionManager);
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('GET /health', () => {
    it('should return health status with all checks', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'healthy',
        version: expect.any(String),
        uptime: expect.any(Number),
        checks: {
          storage: true,
        },
      });
    });

    it('should include uptime in seconds', async () => {
      const response = await request(app).get('/health');

      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return version from package.json', async () => {
      const response = await request(app).get('/health');

      expect(response.body.version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('POST /api/sessions/:projectId/:featureId/questions/:questionId/answer', () => {
    let projectId: string;
    let featureId: string;

    beforeEach(async () => {
      // Create a session first
      const session = await sessionManager.createSession({
        title: 'Test Feature',
        featureDescription: 'Test description',
        projectPath: '/test/project',
      });
      projectId = session.projectId;
      featureId = session.featureId;

      // Add a question to the session
      const questionsPath = `${projectId}/${featureId}/questions.json`;
      await storage.writeJson(questionsPath, {
        version: '1.0',
        sessionId: session.id,
        questions: [
          {
            id: 'q1',
            stage: 'discovery',
            questionType: 'single_choice',
            questionText: 'Which auth method?',
            options: [
              { value: 'jwt', label: 'JWT tokens', recommended: true },
              { value: 'session', label: 'Session cookies', recommended: false },
            ],
            answer: null,
            isRequired: true,
            priority: 1,
            askedAt: new Date().toISOString(),
            answeredAt: null,
          },
        ],
      });
    });

    it('should answer a question successfully', async () => {
      const response = await request(app)
        .post(`/api/sessions/${projectId}/${featureId}/questions/q1/answer`)
        .send({ value: 'jwt' });

      expect(response.status).toBe(200);
      expect(response.body.answer).toEqual({ value: 'jwt' });
      expect(response.body.answeredAt).toBeDefined();
    });

    it('should persist the answer to questions.json', async () => {
      await request(app)
        .post(`/api/sessions/${projectId}/${featureId}/questions/q1/answer`)
        .send({ value: 'session' });

      const questions = await storage.readJson<{ questions: Array<{ id: string; answer: { value: string } | null }> }>(
        `${projectId}/${featureId}/questions.json`
      );

      expect(questions?.questions[0].answer).toEqual({ value: 'session' });
    });

    it('should return 404 for non-existent question', async () => {
      const response = await request(app)
        .post(`/api/sessions/${projectId}/${featureId}/questions/nonexistent/answer`)
        .send({ value: 'jwt' });

      expect(response.status).toBe(404);
      expect(response.body.error).toMatch(/question not found/i);
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .post('/api/sessions/nonexistent/session/questions/q1/answer')
        .send({ value: 'jwt' });

      expect(response.status).toBe(404);
      expect(response.body.error).toMatch(/session not found/i);
    });

    it('should return 400 for missing answer value', async () => {
      const response = await request(app)
        .post(`/api/sessions/${projectId}/${featureId}/questions/q1/answer`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/validation failed/i);
    });

    it('should support text input answers', async () => {
      // Add a text input question
      const questionsPath = `${projectId}/${featureId}/questions.json`;
      const questionsData = await storage.readJson<{ questions: Array<Record<string, unknown>> }>(questionsPath);
      questionsData!.questions.push({
        id: 'q2',
        stage: 'discovery',
        questionType: 'text_input',
        questionText: 'Any additional notes?',
        options: [],
        answer: null,
        isRequired: false,
        priority: 2,
        askedAt: new Date().toISOString(),
        answeredAt: null,
      });
      await storage.writeJson(questionsPath, questionsData);

      const response = await request(app)
        .post(`/api/sessions/${projectId}/${featureId}/questions/q2/answer`)
        .send({ text: 'Use refresh tokens for session management' });

      expect(response.status).toBe(200);
      expect(response.body.answer).toEqual({ text: 'Use refresh tokens for session management' });
    });

    it('should support multi-choice answers', async () => {
      // Add a multi-choice question
      const questionsPath = `${projectId}/${featureId}/questions.json`;
      const questionsData = await storage.readJson<{ questions: Array<Record<string, unknown>> }>(questionsPath);
      questionsData!.questions.push({
        id: 'q3',
        stage: 'discovery',
        questionType: 'multi_choice',
        questionText: 'Which features to include?',
        options: [
          { value: 'login', label: 'Login' },
          { value: 'register', label: 'Register' },
          { value: 'forgot', label: 'Forgot Password' },
        ],
        answer: null,
        isRequired: true,
        priority: 1,
        askedAt: new Date().toISOString(),
        answeredAt: null,
      });
      await storage.writeJson(questionsPath, questionsData);

      const response = await request(app)
        .post(`/api/sessions/${projectId}/${featureId}/questions/q3/answer`)
        .send({ values: ['login', 'register'] });

      expect(response.status).toBe(200);
      expect(response.body.answer).toEqual({ values: ['login', 'register'] });
    });
  });

  describe('GET /api/sessions/:projectId/:featureId/conversations', () => {
    let projectId: string;
    let featureId: string;

    beforeEach(async () => {
      // Create a session first
      const session = await sessionManager.createSession({
        title: 'Test Feature',
        featureDescription: 'Test description',
        projectPath: '/test/project',
      });
      projectId = session.projectId;
      featureId = session.featureId;
    });

    it('should return empty entries when no conversations exist', async () => {
      const response = await request(app)
        .get(`/api/sessions/${projectId}/${featureId}/conversations`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ entries: [] });
    });

    it('should return conversation entries when they exist', async () => {
      const conversationsPath = `${projectId}/${featureId}/conversations.json`;
      const mockConversations = {
        entries: [
          {
            stage: 1,
            timestamp: '2026-01-11T12:00:00Z',
            prompt: 'Explore the codebase',
            output: 'I found the following files...',
            sessionId: 'claude-session-123',
            costUsd: 0.05,
            isError: false,
            parsed: {
              decisions: [],
              planSteps: [],
              planFilePath: null,
              planApproved: false,
              planModeEntered: false,
              planModeExited: false,
            },
          },
        ],
      };
      await storage.writeJson(conversationsPath, mockConversations);

      const response = await request(app)
        .get(`/api/sessions/${projectId}/${featureId}/conversations`);

      expect(response.status).toBe(200);
      expect(response.body.entries).toHaveLength(1);
      expect(response.body.entries[0]).toMatchObject({
        stage: 1,
        prompt: 'Explore the codebase',
        output: 'I found the following files...',
        costUsd: 0.05,
      });
    });

    it('should return multiple conversation entries in order', async () => {
      const conversationsPath = `${projectId}/${featureId}/conversations.json`;
      const mockConversations = {
        entries: [
          {
            stage: 1,
            timestamp: '2026-01-11T12:00:00Z',
            prompt: 'Stage 1 prompt',
            output: 'Stage 1 output',
            sessionId: 'session-1',
            costUsd: 0.03,
            isError: false,
            parsed: { decisions: [], planSteps: [], planFilePath: null, planApproved: false, planModeEntered: false, planModeExited: false },
          },
          {
            stage: 2,
            timestamp: '2026-01-11T13:00:00Z',
            prompt: 'Stage 2 prompt',
            output: 'Stage 2 output',
            sessionId: 'session-1',
            costUsd: 0.07,
            isError: false,
            parsed: { decisions: [], planSteps: [], planFilePath: null, planApproved: true, planModeEntered: false, planModeExited: false },
          },
        ],
      };
      await storage.writeJson(conversationsPath, mockConversations);

      const response = await request(app)
        .get(`/api/sessions/${projectId}/${featureId}/conversations`);

      expect(response.status).toBe(200);
      expect(response.body.entries).toHaveLength(2);
      expect(response.body.entries[0].stage).toBe(1);
      expect(response.body.entries[1].stage).toBe(2);
    });

    it('should include error information when conversation had errors', async () => {
      const conversationsPath = `${projectId}/${featureId}/conversations.json`;
      const mockConversations = {
        entries: [
          {
            stage: 1,
            timestamp: '2026-01-11T12:00:00Z',
            prompt: 'Explore the codebase',
            output: '',
            sessionId: null,
            costUsd: 0,
            isError: true,
            error: 'Claude process timed out',
            parsed: { decisions: [], planSteps: [], planFilePath: null, planApproved: false, planModeEntered: false, planModeExited: false },
          },
        ],
      };
      await storage.writeJson(conversationsPath, mockConversations);

      const response = await request(app)
        .get(`/api/sessions/${projectId}/${featureId}/conversations`);

      expect(response.status).toBe(200);
      expect(response.body.entries[0].isError).toBe(true);
      expect(response.body.entries[0].error).toBe('Claude process timed out');
    });

    it('should return 200 with empty entries for non-existent project', async () => {
      const response = await request(app)
        .get('/api/sessions/nonexistent/session/conversations');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ entries: [] });
    });
  });
});
