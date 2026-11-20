import { describe, test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRulesEnv } from './support/rules-env.mjs';
import { ACTORS, SESSIONS, buildSyntheticDatabase } from '../fixtures/synthetic-data.mjs';

const env = await createRulesEnv();
const { mediatorA, mediatorB, studentA, studentB, noProfile, revoked } = ACTORS;
const id = SESSIONS.anaOnly;
const room = `live_rooms/${id}`;
const chat = `live_room_chat/${id}`;
const members = `live_room_members/${id}`;
const topic = 'Technology & Daily Life';
const initialRoom = { hostUid: mediatorA.uid, topic, slide: topic, online: true };
const message = { senderUid: studentA.uid, text: 'Hello!' };

describe(`${env.label} círculos autenticados e chat`, () => {
  beforeEach(() => env.seed(buildSyntheticDatabase()));
  after(() => env.cleanup());

  test('equipe abre sala da sessão própria, visitante ou conta revogada não lê', async () => {
    const host = env.as(mediatorA);
    await env.allowed(host.set(room, initialRoom));
    assert.deepEqual(await env.as(studentA).get(room), initialRoom);
    for (const actor of [null, noProfile, revoked]) await env.denied(env.as(actor).get('live_rooms'));
    await env.denied(env.as(mediatorB).set(`${room}/slide`, 'Questão diferente'));
    await env.denied(env.as(studentA).set(`${room}/slide`, 'Questão diferente'));
    await env.allowed(host.set(`${room}/slide`, 'How often do you use your phone?'));
  });

  test('entrada própria libera o chat da sala e preserva autoria e presença histórica', async () => {
    await env.as(mediatorA).set(room, initialRoom);
    const ana = env.as(studentA);
    const bruno = env.as(studentB);
    await env.denied(ana.get(chat));
    await env.denied(ana.set(`${members}/${studentB.uid}`, true));
    await env.allowed(ana.set(`${members}/${studentA.uid}`, true));
    await env.allowed(ana.set(`${chat}/message-a`, message));
    await env.denied(ana.set(`${chat}/message-b`, { ...message, senderUid: studentB.uid }));
    await env.denied(ana.set(`${chat}/message-c`, { ...message, text: 'x'.repeat(501) }));
    await env.denied(ana.set(`${chat}/message-a`, { ...message, text: 'Edited' }));
    await env.denied(bruno.get(chat));
    await env.denied(ana.get('live_room_chat'));
    await env.denied(ana.get(members));
    assert.deepEqual(await ana.get(chat), { 'message-a': message });
    await env.allowed(bruno.set(`${members}/${studentB.uid}`, true));
    assert.equal(await env.adminGet(`meeting_sessions/${id}/attendees/${studentB.uid}`), null);
    assert.equal(await env.adminGet(`user_sessions/${studentB.uid}/${id}`), null);
  });

  test('aluno sai da sala: remove somente o próprio vínculo e perde acesso ao chat', async () => {
    await env.as(mediatorA).set(room, initialRoom);
    const ana = env.as(studentA);
    const bruno = env.as(studentB);
    await env.allowed(ana.set(`${members}/${studentA.uid}`, true));
    await env.allowed(bruno.set(`${members}/${studentB.uid}`, true));
    await env.allowed(ana.set(`${chat}/message-a`, message));
    await env.denied(ana.remove(`${members}/${studentB.uid}`));
    await env.allowed(ana.remove(`${members}/${studentA.uid}`));
    assert.equal(await env.adminGet(`${members}/${studentA.uid}`), null);
    assert.equal(await env.adminGet(`${members}/${studentB.uid}`), true);
    await env.denied(ana.get(chat));
    await env.denied(ana.set(`${chat}/message-b`, message));
    await env.allowed(ana.set(`${members}/${studentA.uid}`, true));
    assert.deepEqual(await ana.get(chat), { 'message-a': message });
  });

  test('aluno desconecta e sua inscrição é removida mesmo se o anfitrião ficar offline', async () => {
    const host = env.as(mediatorA);
    const ana = env.as(studentA);
    await host.set(room, initialRoom);
    await env.allowed(ana.set(`${members}/${studentA.uid}`, true));
    await ana.onDisconnectRemove(`${members}/${studentA.uid}`);
    await host.onDisconnectRemove(`${room}/online`);
    await host.goOffline();
    await env.waitForAdmin(room, (value) => value && !value.online);
    await ana.goOffline();
    await env.waitForAdmin(`${members}/${studentA.uid}`, (value) => value === null);
  });

  test('apenas o anfitrião encerra sala, chat e entradas; desconexão suspende novas mensagens', async () => {
    const host = env.as(mediatorA);
    const ana = env.as(studentA);
    await host.set(room, initialRoom);
    await ana.set(`${members}/${studentA.uid}`, true);
    await ana.set(`${chat}/message-a`, message);
    await host.onDisconnectRemove(`${room}/online`);
    await host.goOffline();
    await env.waitForAdmin(room, (value) => value && !value.online);
    await env.denied(ana.set(`${chat}/message-b`, message));
    await env.denied(env.as(mediatorB).remove(room));
    await host.goOnline();
    await env.allowed(host.set(`${room}/online`, true));
    await env.allowed(host.update('/', { [room]: null, [chat]: null, [members]: null }));
    assert.equal(await env.adminGet(room), null);
    assert.equal(await env.adminGet(chat), null);
    assert.equal(await env.adminGet(members), null);
    assert.ok(await env.adminGet(`meeting_sessions/${id}`));
  });
});
