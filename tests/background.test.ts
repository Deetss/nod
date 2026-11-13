import { afterEach, describe, expect, it } from 'vitest';
import { startBackground, type Background } from '../server/background';
import { DeviceStore } from '../server/devices';
import { FakeProvider, pr, recordingSender, settle, SUB, VIEWER } from './notify-helpers';

let running: Background | undefined;

afterEach(() => {
  running?.sync.stop();
  running = undefined;
});

async function pairedPhone(): Promise<DeviceStore> {
  const devices = DeviceStore.memory();
  await devices.setPush(await devices.add('Phone'), SUB);
  return devices;
}

describe('background wiring', () => {
  it('polls on start and pushes what the poll changed, with the first poll as the baseline', async () => {
    const provider = new FakeProvider({ prs: [] }, { prs: [pr({ number: 7, requested: [VIEWER] })] });
    const { send, sent } = recordingSender();
    running = startBackground({ provider: provider.asProvider(), devices: await pairedPhone(), pushSender: send, fixtures: false });
    await settle();

    expect(provider.polls).toBe(1);
    expect(sent.map((p) => p.title)).toEqual(['Review requested: acme-api #7']);
  });

  it('still polls without phone access, and the sync loop is there for nudges', async () => {
    const provider = new FakeProvider({ prs: [] });
    running = startBackground({ provider: provider.asProvider(), devices: DeviceStore.memory(), pushSender: undefined, fixtures: false });
    await settle();

    expect(provider.polls).toBe(1);
    expect(running.notifier).toBeUndefined();
    expect(typeof running.sync.nudge).toBe('function');
  });

  it('never pushes fixture data', async () => {
    const provider = new FakeProvider({ prs: [] }, { prs: [pr({ number: 7, requested: [VIEWER] })] });
    const { send, sent } = recordingSender();
    running = startBackground({ provider: provider.asProvider(), devices: await pairedPhone(), pushSender: send, fixtures: true });
    await settle();

    expect(running.notifier).toBeUndefined();
    expect(sent).toEqual([]);
  });
});
