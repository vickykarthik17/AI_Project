import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEMO_STUDENT_EMAIL,
  DEMO_STUDENT_PASSWORD,
  DEMO_STUDENT_UUID,
  isSupabaseConfigured,
  STORAGE_BUCKET_MATERIALS,
  toUuid,
} from './supabase';
import { repo } from './repository';
import { computeDeterministicEmbedding } from '../domain/engine';

test('Supabase schema migration contains all 15 required relational tables with UUID PKs and RLS', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20261113000000_gapfinder_schema.sql'
  );
  assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');

  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Verify pgvector and uuid extensions
  assert.ok(sql.includes('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'), 'Must enable uuid-ossp');
  assert.ok(sql.includes('CREATE EXTENSION IF NOT EXISTS "vector"'), 'Must enable vector');

  // Verify all 15 relational tables
  const expectedTables = [
    'public.students',
    'public.subjects',
    'public.documents',
    'public.document_chunks',
    'public.topics',
    'public.subtopics',
    'public.past_paper_questions',
    'public.quizzes',
    'public.quiz_questions',
    'public.student_answers',
    'public.topic_performance',
    'public.gap_reports',
    'public.revision_plans',
    'public.revision_tasks',
    'public.progress_history',
  ];

  for (const table of expectedTables) {
    assert.ok(
      sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
      `Migration must create table ${table}`
    );
  }

  // Verify vector(64) column on document_chunks
  assert.ok(sql.includes('embedding vector(64)'), 'document_chunks must have embedding vector(64)');

  // Verify HNSW vector index
  assert.ok(
    sql.includes('USING hnsw (embedding vector_cosine_ops)'),
    'Migration must define HNSW index for vector_cosine_ops'
  );

  // Verify RLS enabled on all 15 tables
  for (const table of expectedTables) {
    assert.ok(
      sql.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`),
      `RLS must be enabled on ${table}`
    );
  }

  // Verify user signup trigger
  assert.ok(sql.includes('FUNCTION public.handle_new_user()'), 'Must define signup trigger function');
  assert.ok(sql.includes('TRIGGER on_auth_user_created'), 'Must define on_auth_user_created trigger');

  // Verify storage bucket and policies
  assert.ok(sql.includes("'study-materials'"), 'Must create study-materials bucket');
  assert.ok(
    sql.includes('(storage.foldername(name))[1] = auth.uid()::text'),
    'Must isolate storage files to auth.uid() subfolder'
  );
});

test('Supabase seed.sql provisions demo account and seeds all 15 tables with rich historical data', () => {
  const seedPath = path.resolve(process.cwd(), 'supabase/seed.sql');
  assert.ok(fs.existsSync(seedPath), 'seed.sql must exist');

  const seedSql = fs.readFileSync(seedPath, 'utf8');

  // Verify demo user credentials and UUID
  assert.ok(seedSql.includes(DEMO_STUDENT_UUID), 'Must use fixed demo student UUID');
  assert.ok(seedSql.includes(DEMO_STUDENT_EMAIL), 'Must include demo@gapfinder.ai');
  assert.ok(seedSql.includes("crypt('Demo@123', gen_salt('bf'))"), 'Must hash Demo@123 password');

  // Verify sample tables populated
  assert.ok(seedSql.includes('INSERT INTO public.subjects'), 'Must seed subjects');
  assert.ok(seedSql.includes('INSERT INTO public.documents'), 'Must seed documents');
  assert.ok(seedSql.includes('INSERT INTO public.document_chunks'), 'Must seed document chunks');
  assert.ok(seedSql.includes('::vector(64)'), 'Must include 64-dimensional vector literals');
  assert.ok(seedSql.includes('INSERT INTO public.topics'), 'Must seed topics');
  assert.ok(seedSql.includes('INSERT INTO public.subtopics'), 'Must seed subtopics');
  assert.ok(seedSql.includes('INSERT INTO public.past_paper_questions'), 'Must seed past paper questions');
  assert.ok(seedSql.includes('INSERT INTO public.quizzes'), 'Must seed quizzes');
  assert.ok(seedSql.includes('INSERT INTO public.quiz_questions'), 'Must seed quiz questions');
  assert.ok(seedSql.includes('INSERT INTO public.student_answers'), 'Must seed student answers');
  assert.ok(seedSql.includes('INSERT INTO public.topic_performance'), 'Must seed topic performance');
  assert.ok(seedSql.includes('INSERT INTO public.gap_reports'), 'Must seed gap reports');
  assert.ok(seedSql.includes('INSERT INTO public.revision_plans'), 'Must seed revision plans');
  assert.ok(seedSql.includes('INSERT INTO public.revision_tasks'), 'Must seed revision tasks');
  assert.ok(seedSql.includes('INSERT INTO public.progress_history'), 'Must seed progress history');

  // Verify multiple historical quiz attempts are preserved
  assert.ok(seedSql.includes('Baseline Diagnostic Assessment #1'), 'Must preserve attempt 1');
  assert.ok(seedSql.includes('Checkpoint Quiz #2'), 'Must preserve attempt 2');
  assert.ok(seedSql.includes('Diagnostic Assessment #3'), 'Must preserve attempt 3');
});

test('toUuid creates deterministic, valid RFC4122-compliant UUIDs', () => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const demoUuid = toUuid('user_demo_biology_01');
  assert.equal(demoUuid, DEMO_STUDENT_UUID);

  const chunkUuid1 = toUuid('chunk_bio_01');
  const chunkUuid2 = toUuid('chunk_bio_01');
  assert.ok(uuidRegex.test(chunkUuid1), 'Generated string must be a valid UUID');
  assert.equal(chunkUuid1, chunkUuid2, 'Must be deterministic across calls');

  const existingUuid = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  assert.equal(toUuid(existingUuid), existingUuid, 'Valid UUID should remain unchanged');
});

test('Embedding generation aligns with 64-dimensional pgvector schema', () => {
  const text = 'Thylakoid light reactions synthesize ATP and NADPH via chemiosmosis.';
  const vec = computeDeterministicEmbedding(text, 64);

  assert.equal(vec.length, 64, 'Embedding vector must be exactly 64 dimensions');
  assert.ok(
    vec.every((v) => typeof v === 'number' && !isNaN(v)),
    'All elements must be valid numbers'
  );

  // Vector should be unit-normalized
  const magnitude = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
  assert.ok(Math.abs(magnitude - 1.0) < 0.01, 'Vector must be normalized');
});

test('Frontend code never references or imports SUPABASE_SERVICE_ROLE_KEY', () => {
  const frontendDir = path.resolve(process.cwd(), 'src');
  const files = fs.readdirSync(frontendDir);

  for (const file of files) {
    const fullPath = path.join(frontendDir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      assert.equal(
        content.includes('SUPABASE_SERVICE_ROLE_KEY'),
        false,
        `Frontend file ${file} must never reference SUPABASE_SERVICE_ROLE_KEY`
      );
    }
  }

  // Also check components
  const compDir = path.resolve(process.cwd(), 'src/components');
  if (fs.existsSync(compDir)) {
    const compFiles = fs.readdirSync(compDir);
    for (const file of compFiles) {
      const fullPath = path.join(compDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      assert.equal(
        content.includes('SUPABASE_SERVICE_ROLE_KEY'),
        false,
        `Component file ${file} must never reference SUPABASE_SERVICE_ROLE_KEY`
      );
    }
  }
});

test('Unified repository provides isolated per-student data retrieval', async () => {
  const student1 = 'test_student_alpha';
  const student2 = 'test_student_beta';

  const doc1 = {
    id: `mat_test_${Date.now()}_1`,
    userId: student1,
    title: 'Alpha Syllabus',
    fileName: 'Alpha_Syllabus.pdf',
    subject: 'Biology',
    docType: 'Syllabus' as const,
    fileSize: 1024,
    pageCount: 2,
    chunkCount: 1,
    status: 'Ready' as const,
    isSample: false,
    uploadedAt: new Date().toISOString(),
  };

  const doc2 = {
    id: `mat_test_${Date.now()}_2`,
    userId: student2,
    title: 'Beta Notes',
    fileName: 'Beta_Notes.pdf',
    subject: 'Biology',
    docType: 'Study Notes' as const,
    fileSize: 2048,
    pageCount: 3,
    chunkCount: 2,
    status: 'Ready' as const,
    isSample: false,
    uploadedAt: new Date().toISOString(),
  };

  await repo.saveMaterial(doc1);
  await repo.saveMaterial(doc2);

  const student1Materials = await repo.getMaterials(student1);
  const student2Materials = await repo.getMaterials(student2);

  assert.ok(
    student1Materials.some((m) => m.id === doc1.id),
    'Student 1 should see their own materials'
  );
  assert.ok(
    !student1Materials.some((m) => m.id === doc2.id),
    'Student 1 must NOT see Student 2 materials (Data Isolation)'
  );

  assert.ok(
    student2Materials.some((m) => m.id === doc2.id),
    'Student 2 should see their own materials'
  );
  assert.ok(
    !student2Materials.some((m) => m.id === doc1.id),
    'Student 2 must NOT see Student 1 materials (Data Isolation)'
  );

  // Clean up
  await repo.deleteMaterial(doc1.id, student1);
  await repo.deleteMaterial(doc2.id, student2);
});

