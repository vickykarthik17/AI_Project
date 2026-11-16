import test from 'node:test';
import assert from 'node:assert/strict';
import { dbRepo } from './db';
import { repo } from './repository';
import { ChatMessage } from '../types';

test('1. Conversation Lifecycle: Create, list, rename, and delete conversation with cascade', async () => {
  const studentId = 'test_student_conv_01';
  
  // 1. Create conversations
  const conv1 = await repo.createConversation(studentId, 'Cellular Energetics Session', 'Biology');
  assert.ok(conv1.id, 'Conversation should have an id');
  assert.equal(conv1.title, 'Cellular Energetics Session');
  assert.equal(conv1.userId, studentId);

  const conv2 = await repo.createConversation(studentId, 'Genetics Revision', 'Biology');
  assert.ok(conv2.id);

  // 2. List conversations
  const list = await repo.getConversations(studentId);
  assert.ok(list.length >= 2, 'Should list at least 2 conversations');
  const foundConv1 = list.find((c) => c.id === conv1.id);
  assert.ok(foundConv1, 'Should find conv1 in list');

  // 3. Rename conversation
  const updated = await repo.updateConversation(conv1.id, studentId, 'Advanced Cellular Respiration');
  assert.ok(updated);
  assert.equal(updated.title, 'Advanced Cellular Respiration');

  // 4. Attach messages to conv1
  const msg1: ChatMessage = {
    id: `msg_test_01_${Date.now()}`,
    userId: studentId,
    conversationId: conv1.id,
    role: 'user',
    content: 'Explain the role of NADH and FADH2 in electron transport chain.',
    citations: [],
    grounded: true,
    createdAt: new Date().toISOString(),
  };
  await repo.saveChatMessage(msg1, studentId);

  const msgs = await repo.getChatMessages(studentId, conv1.id);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].content, 'Explain the role of NADH and FADH2 in electron transport chain.');

  // 5. Delete conversation with cascade
  const deleted = await repo.deleteConversation(conv1.id, studentId);
  assert.equal(deleted, true);

  const afterDeleteList = await repo.getConversations(studentId);
  assert.equal(afterDeleteList.some((c) => c.id === conv1.id), false);

  const afterDeleteMsgs = await repo.getChatMessages(studentId, conv1.id);
  assert.equal(afterDeleteMsgs.length, 0, 'Messages belonging to deleted conversation should be deleted');
});

test('2. Student Learning Memory: Strictly isolated per student profile', async () => {
  const studentA = `test_student_mem_A_${Date.now()}`;
  const studentB = `test_student_mem_B_${Date.now()}`;

  // Student A saves memory
  const memA = await repo.saveStudentMemory(studentA, {
    key: 'struggling_concept',
    content: 'Student A struggles with non-cyclic photophosphorylation',
    source: 'quiz',
  });
  assert.ok(memA.id);
  assert.equal(memA.userId, studentA);

  // Student B saves memory
  const memB = await repo.saveStudentMemory(studentB, {
    key: 'struggling_concept',
    content: 'Student B struggles with Mendelian dihybrid crosses',
    source: 'assistant',
  });
  assert.ok(memB.id);
  assert.equal(memB.userId, studentB);

  // Verify Student A sees only Student A memories
  const listA = await repo.getStudentMemories(studentA);
  assert.equal(listA.length, 1);
  assert.equal(listA[0].content, 'Student A struggles with non-cyclic photophosphorylation');

  // Verify Student B sees only Student B memories
  const listB = await repo.getStudentMemories(studentB);
  assert.equal(listB.length, 1);
  assert.equal(listB[0].content, 'Student B struggles with Mendelian dihybrid crosses');

  // Delete memory
  const delA = await repo.deleteStudentMemory(memA.id, studentA);
  assert.equal(delA, true);

  const afterDelListA = await repo.getStudentMemories(studentA);
  assert.equal(afterDelListA.length, 0);

  // Student B memory still intact
  const afterDelListB = await repo.getStudentMemories(studentB);
  assert.equal(afterDelListB.length, 1);

  // Clean up student B
  await repo.deleteStudentMemory(memB.id, studentB);
});

test('3. Dash Compliance: All conversations, messages, and student memories have zero em dashes or en dashes', async () => {
  const emDash = /\u2014/;
  const enDash = /\u2013/;

  const studentId = 'test_student_dash_check';
  const conv = await repo.createConversation(studentId, 'Test Session - No Em Dash', 'Biology');
  assert.ok(!emDash.test(conv.title), 'Conversation title must not contain em dash');
  assert.ok(!enDash.test(conv.title), 'Conversation title must not contain en dash');

  const mem = await repo.saveStudentMemory(studentId, {
    key: 'learning_note',
    content: 'Focus on glycolysis ATP yield - 2 net ATP via substrate level phosphorylation',
    source: 'manual',
  });
  assert.ok(!emDash.test(mem.content), 'Memory content must not contain em dash');
  assert.ok(!enDash.test(mem.content), 'Memory content must not contain en dash');

  // Clean up
  await repo.deleteConversation(conv.id, studentId);
  await repo.deleteStudentMemory(mem.id, studentId);
});
