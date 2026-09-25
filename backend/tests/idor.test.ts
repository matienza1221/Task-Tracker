import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import {
  addMemberFixture,
  createLabelFixture,
  createMilestoneFixture,
  createProjectFixture,
  createTaskFixture,
  createTestUser,
} from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

/**
 * IDOR / BOLA release gate (ARCHITECTURE.md §8.5).
 *
 * Two fully populated projects owned by different managers; a developer and a
 * viewer are members of project A only. Every attempt to reach project B's
 * resources — by id, by nested path, or by cross-project id substitution —
 * must fail without leaking existence (404) or without permission (403).
 */
async function twoProjectScenario() {
  const pmA = await createUserWithSession(app, { email: 'pm-a@example.com', globalRole: 'PROJECT_MANAGER' });
  const pmB = await createUserWithSession(app, { email: 'pm-b@example.com', globalRole: 'PROJECT_MANAGER' });
  const devA = await createUserWithSession(app, { email: 'dev-a@example.com', globalRole: 'DEVELOPER' });
  const viewerA = await createUserWithSession(app, { email: 'viewer-a@example.com', globalRole: 'VIEWER' });
  const admin = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });

  const projectA = await createProjectFixture({ manager: pmA.user, code: 'AAA', name: 'Project A' });
  const projectB = await createProjectFixture({ manager: pmB.user, code: 'BBB', name: 'Project B' });

  await addMemberFixture(projectA.id, devA.user, 'DEVELOPER');
  await addMemberFixture(projectA.id, viewerA.user, 'VIEWER');

  const milestoneA = await createMilestoneFixture(projectA.id, 'A Milestone');
  const milestoneB = await createMilestoneFixture(projectB.id, 'B Milestone');
  const labelA = await createLabelFixture(projectA.id, 'A Label');
  const labelB = await createLabelFixture(projectB.id, 'B Label');
  const viewB = await prisma.savedView.create({
    data: { userId: pmB.user.id, projectId: projectB.id, scope: 'PROJECT', name: 'B View', filters: {} },
  });

  return { pmA, pmB, devA, viewerA, admin, projectA, projectB, milestoneA, milestoneB, labelA, labelB, viewB };
}

describe('IDOR: project resources are not reachable by id substitution', () => {
  it('returns 404 for foreign projects while member projects stay accessible', async () => {
    const { devA, projectA, projectB } = await twoProjectScenario();

    expect((await authed(app, devA.client).get(`/api/projects/${projectA.id}`)).status).toBe(200);

    for (const path of [
      `/api/projects/${projectB.id}`,
      `/api/projects/${projectB.id}/members`,
      `/api/projects/${projectB.id}/milestones`,
      `/api/projects/${projectB.id}/labels`,
      `/api/projects/${projectB.id}/saved-views`,
      `/api/projects/${projectB.id}/activity`,
    ]) {
      const response = await authed(app, devA.client).get(path);
      expect(response.status, `GET ${path}`).toBe(404);
    }
  });

  it('returns 404 for foreign project mutations and changes nothing', async () => {
    const { devA, projectB } = await twoProjectScenario();

    const before = await prisma.project.findUniqueOrThrow({ where: { id: projectB.id } });

    const attempts = [
      authed(app, devA.client).patch(`/api/projects/${projectB.id}`).send({ name: 'Hijacked' }),
      authed(app, devA.client).post(`/api/projects/${projectB.id}/archive`),
      authed(app, devA.client).post(`/api/projects/${projectB.id}/unarchive`),
      authed(app, devA.client).delete(`/api/projects/${projectB.id}`),
      authed(app, devA.client).post(`/api/projects/${projectB.id}/milestones`).send({ name: 'Injected' }),
      authed(app, devA.client).post(`/api/projects/${projectB.id}/labels`).send({ name: 'Injected' }),
      authed(app, devA.client)
        .post(`/api/projects/${projectB.id}/saved-views`)
        .send({ name: 'Injected', filters: {} }),
    ];

    for (const attempt of attempts) {
      expect((await attempt).status).toBe(404);
    }

    const after = await prisma.project.findUniqueOrThrow({ where: { id: projectB.id } });
    expect(after.name).toBe(before.name);
    expect(after.isArchived).toBe(false);
    expect(after.deletedAt).toBeNull();
    expect(await prisma.milestone.count({ where: { projectId: projectB.id } })).toBe(1);
    expect(await prisma.label.count({ where: { projectId: projectB.id } })).toBe(1);
  });

  it('cannot self-escalate into a foreign project through member endpoints', async () => {
    const { devA, projectB } = await twoProjectScenario();

    const addSelf = await authed(app, devA.client)
      .post(`/api/projects/${projectB.id}/members`)
      .send({ userId: devA.user.id, projectRole: 'MANAGER' });
    expect(addSelf.status).toBe(404);

    expect(await prisma.projectMember.count({ where: { projectId: projectB.id, userId: devA.user.id } })).toBe(0);
  });

  it('cannot reach a foreign milestone by using it under a project the user belongs to', async () => {
    const { pmA, projectA, projectB, milestoneB } = await twoProjectScenario();

    const update = await authed(app, pmA.client)
      .patch(`/api/projects/${projectA.id}/milestones/${milestoneB.id}`)
      .send({ name: 'Hijacked' });
    expect(update.status).toBe(404);

    const remove = await authed(app, pmA.client)
      .delete(`/api/projects/${projectA.id}/milestones/${milestoneB.id}`);
    expect(remove.status).toBe(404);

    const untouched = await prisma.milestone.findUniqueOrThrow({ where: { id: milestoneB.id } });
    expect(untouched.name).toBe('B Milestone');
    expect(untouched.deletedAt).toBeNull();
    expect(projectB.id).toBeTruthy();
  });

  it('cannot reach a foreign label through a project the user belongs to', async () => {
    const { pmA, projectA, labelB } = await twoProjectScenario();

    const update = await authed(app, pmA.client)
      .patch(`/api/projects/${projectA.id}/labels/${labelB.id}`)
      .send({ name: 'Hijacked' });
    expect(update.status).toBe(404);

    const remove = await authed(app, pmA.client).delete(`/api/projects/${projectA.id}/labels/${labelB.id}`);
    expect(remove.status).toBe(404);

    const untouched = await prisma.label.findUniqueOrThrow({ where: { id: labelB.id } });
    expect(untouched.name).toBe('B Label');
    expect(untouched.deletedAt).toBeNull();
  });

  it('cannot read or delete another user\u2019s saved view in the same project', async () => {
    const { pmA, projectB, viewB } = await twoProjectScenario();

    const list = await authed(app, pmA.client).get(`/api/projects/${projectB.id}/saved-views`);
    expect(list.status).toBe(404);

    const remove = await authed(app, pmA.client).delete(`/api/projects/${projectB.id}/saved-views/${viewB.id}`);
    expect(remove.status).toBe(404);
    expect(await prisma.savedView.count({ where: { id: viewB.id } })).toBe(1);
  });

  it('cannot read foreign activity feeds', async () => {
    const { devA, projectB } = await twoProjectScenario();
    await prisma.activityLog.create({
      data: {
        projectId: projectB.id,
        actorNameSnapshot: 'Someone',
        action: 'PROJECT_CREATED',
        metadata: { secret: 'project-b-internal' },
      },
    });

    const response = await authed(app, devA.client).get(`/api/projects/${projectB.id}/activity`);
    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain('project-b-internal');
  });
});

describe('IDOR: visible resources still enforce project roles', () => {
  it('forbids viewers from mutating anything in their own project', async () => {
    const { viewerA, projectA, milestoneA } = await twoProjectScenario();

    const attempts = [
      authed(app, viewerA.client).patch(`/api/projects/${projectA.id}`).send({ name: 'Nope' }),
      authed(app, viewerA.client).post(`/api/projects/${projectA.id}/archive`),
      authed(app, viewerA.client).delete(`/api/projects/${projectA.id}`),
      authed(app, viewerA.client).post(`/api/projects/${projectA.id}/members`).send({ userId: viewerA.user.id, projectRole: 'MANAGER' }),
      authed(app, viewerA.client).patch(`/api/projects/${projectA.id}/members/${viewerA.user.id}`).send({ projectRole: 'MANAGER' }),
      authed(app, viewerA.client).delete(`/api/projects/${projectA.id}/members/${viewerA.user.id}`),
      authed(app, viewerA.client).post(`/api/projects/${projectA.id}/milestones`).send({ name: 'Nope' }),
      authed(app, viewerA.client).patch(`/api/projects/${projectA.id}/milestones/${milestoneA.id}`).send({ name: 'Nope' }),
      authed(app, viewerA.client).delete(`/api/projects/${projectA.id}/milestones/${milestoneA.id}`),
      authed(app, viewerA.client).post(`/api/projects/${projectA.id}/labels`).send({ name: 'Nope' }),
    ];

    for (const attempt of attempts) {
      expect((await attempt).status).toBe(403);
    }
  });

  it('forbids developers from managing members, milestones and labels in their own project', async () => {
    const { devA, projectA, milestoneA, labelA } = await twoProjectScenario();
    const target = await createTestUser({ email: 'target@example.com' });

    const attempts = [
      authed(app, devA.client).patch(`/api/projects/${projectA.id}`).send({ name: 'Nope' }),
      authed(app, devA.client).post(`/api/projects/${projectA.id}/archive`),
      authed(app, devA.client).post(`/api/projects/${projectA.id}/members`).send({ userId: target.id, projectRole: 'DEVELOPER' }),
      authed(app, devA.client).post(`/api/projects/${projectA.id}/milestones`).send({ name: 'Nope' }),
      authed(app, devA.client).patch(`/api/projects/${projectA.id}/milestones/${milestoneA.id}`).send({ name: 'Nope' }),
      authed(app, devA.client).post(`/api/projects/${projectA.id}/labels`).send({ name: 'Nope' }),
      authed(app, devA.client).patch(`/api/projects/${projectA.id}/labels/${labelA.id}`).send({ name: 'Nope' }),
    ];

    for (const attempt of attempts) {
      expect((await attempt).status).toBe(403);
    }

    // Read access, which developers do have.
    expect((await authed(app, devA.client).get(`/api/projects/${projectA.id}/milestones`)).status).toBe(200);
    expect((await authed(app, devA.client).get(`/api/projects/${projectA.id}/labels`)).status).toBe(200);
  });

  it('does not let a manager of one project manage another manager\u2019s project', async () => {
    const { pmA, projectB } = await twoProjectScenario();

    const response = await authed(app, pmA.client).patch(`/api/projects/${projectB.id}`).send({ name: 'Hijacked' });
    expect(response.status).toBe(404);
  });
});

describe('IDOR: administrators retain full access', () => {
  it('administrators can read and mutate any project without membership', async () => {
    const { admin, projectB, milestoneB } = await twoProjectScenario();

    expect((await authed(app, admin.client).get(`/api/projects/${projectB.id}`)).status).toBe(200);
    expect((await authed(app, admin.client).get(`/api/projects/${projectB.id}/members`)).status).toBe(200);

    const update = await authed(app, admin.client)
      .patch(`/api/projects/${projectB.id}`)
      .send({ name: 'Renamed by admin' });
    expect(update.status).toBe(200);

    const milestoneUpdate = await authed(app, admin.client)
      .patch(`/api/projects/${projectB.id}/milestones/${milestoneB.id}`)
      .send({ status: 'IN_PROGRESS' });
    expect(milestoneUpdate.status).toBe(200);
  });

  it('does not let administrators bypass user-management guards (self-demotion)', async () => {
    const { admin } = await twoProjectScenario();
    const response = await authed(app, admin.client)
      .patch(`/api/users/${admin.user.id}/role`)
      .send({ globalRole: 'VIEWER' });
    expect(response.status).toBe(403);
  });
});

describe('IDOR: directory endpoints stay minimal', () => {
  it('does not expose credential material through the lookup endpoint', async () => {
    const { devA, pmA } = await twoProjectScenario();

    const asDeveloper = await authed(app, devA.client).get('/api/users/lookup?search=pm-a');
    expect(asDeveloper.status).toBe(403);

    const asManager = await authed(app, pmA.client).get('/api/users/lookup?search=dev');
    expect(asManager.status).toBe(200);
    expect(JSON.stringify(asManager.body)).not.toContain('passwordHash');
    expect(JSON.stringify(asManager.body)).not.toContain('lockedUntil');
  });
});

describe('IDOR: tasks', () => {
  it('blocks cross-project task access, mutation and subtask creation', async () => {
    const { devA, pmA, pmB, projectA, projectB } = await twoProjectScenario();
    const taskA = await createTaskFixture({ projectId: projectA.id, reporter: pmA.user, title: 'Task A' });
    const taskB = await createTaskFixture({ projectId: projectB.id, reporter: pmB.user, title: 'Task B' });
    const done = await prisma.taskStatus.findFirstOrThrow({ where: { key: 'DONE' } });

    // Sanity: the developer can reach their own project's task.
    expect((await authed(app, devA.client).get(`/api/tasks/${taskA.id}`)).status).toBe(200);

    const attempts = [
      authed(app, devA.client).get(`/api/tasks/${taskB.id}`),
      authed(app, devA.client).patch(`/api/tasks/${taskB.id}`).send({ version: taskB.version, title: 'Hijacked' }),
      authed(app, devA.client).delete(`/api/tasks/${taskB.id}`),
      authed(app, devA.client).patch(`/api/tasks/${taskB.id}/status`).send({ statusId: done.id, version: taskB.version }),
      authed(app, devA.client)
        .patch(`/api/tasks/${taskB.id}/assignee`)
        .send({ assigneeId: devA.user.id, version: taskB.version }),
      authed(app, devA.client).post(`/api/tasks/${taskB.id}/subtasks`).send({ title: 'Injected subtask' }),
      authed(app, devA.client).get(`/api/tasks/${taskB.id}/activity`),
      authed(app, devA.client).get(`/api/projects/${projectB.id}/tasks`),
      authed(app, devA.client).post(`/api/projects/${projectB.id}/tasks`).send({ title: 'Injected task' }),
    ];

    for (const attempt of attempts) {
      expect((await attempt).status).toBe(404);
    }

    const untouched = await prisma.task.findUniqueOrThrow({ where: { id: taskB.id } });
    expect(untouched.title).toBe('Task B');
    expect(untouched.deletedAt).toBeNull();
    expect(untouched.version).toBe(taskB.version);
    expect(await prisma.task.count({ where: { parentTaskId: taskB.id } })).toBe(0);
  });

  it('cannot use foreign ids as task references', async () => {
    const { devA, pmB, projectA, projectB, milestoneB } = await twoProjectScenario();
    const taskB = await createTaskFixture({ projectId: projectB.id, reporter: pmB.user });

    const foreignMilestone = await authed(app, devA.client)
      .post(`/api/projects/${projectA.id}/tasks`)
      .send({ title: 'Cross-project milestone', milestoneId: milestoneB.id });
    expect(foreignMilestone.status).toBe(404);

    const foreignParent = await authed(app, devA.client)
      .post(`/api/projects/${projectA.id}/tasks`)
      .send({ title: 'Cross-project parent', parentTaskId: taskB.id });
    expect(foreignParent.status).toBe(404);
  });

  it('keeps project roles authoritative inside a visible project', async () => {
    const { devA, viewerA, pmA, pmB, projectA } = await twoProjectScenario();
    const outsider = await createUserWithSession(app, { email: 'outsider-2@example.com', globalRole: 'DEVELOPER' });
    const taskA = await createTaskFixture({ projectId: projectA.id, reporter: pmA.user });
    const done = await prisma.taskStatus.findFirstOrThrow({ where: { key: 'DONE' } });

    // Viewers read but never write.
    expect((await authed(app, viewerA.client).get(`/api/tasks/${taskA.id}`)).status).toBe(200);
    expect(
      (
        await authed(app, viewerA.client)
          .patch(`/api/tasks/${taskA.id}/status`)
          .send({ statusId: done.id, version: taskA.version })
      ).status,
    ).toBe(403);
    expect((await authed(app, viewerA.client).delete(`/api/tasks/${taskA.id}`)).status).toBe(403);

    // Developers do not delete tasks or assign other people.
    expect((await authed(app, devA.client).delete(`/api/tasks/${taskA.id}`)).status).toBe(403);
    expect(
      (
        await authed(app, devA.client)
          .patch(`/api/tasks/${taskA.id}/assignee`)
          .send({ assigneeId: pmB.user.id, version: taskA.version })
      ).status,
    ).toBe(403);

    // Non-members see nothing at all.
    expect((await authed(app, outsider.client).get(`/api/tasks/${taskA.id}`)).status).toBe(404);
    expect((await authed(app, outsider.client).get(`/api/my/tasks`)).body.meta.total).toBe(0);
  });
});
