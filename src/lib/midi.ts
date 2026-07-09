import type { MelodyClip, MelodyNote, MelodyTrack } from "../types/idea";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  }
}

const ticksPerQuarter = 480;
const defaultStepsPerBeat = 4;
const defaultBeatsPerBar = 4;
const defaultTrackVolume = 100;
const trackColors = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c"];

export const gmInstruments = [
  { program: 0, name: "钢琴", slug: "acoustic_grand_piano" },
  { program: 4, name: "电钢琴", slug: "electric_piano_1" },
  { program: 6, name: "拨弦键琴", slug: "harpsichord" },
  { program: 16, name: "风琴", slug: "drawbar_organ" },
  { program: 24, name: "尼龙吉他", slug: "acoustic_guitar_nylon" },
  { program: 32, name: "贝斯", slug: "acoustic_bass" },
  { program: 48, name: "弦乐合奏", slug: "string_ensemble_2" },
  { program: 56, name: "小号", slug: "trumpet" },
  { program: 73, name: "长笛", slug: "flute" },
  { program: 80, name: "方波主音", slug: "lead_1_square" },
  { program: 81, name: "锯齿主音", slug: "lead_2_sawtooth" },
  { program: 88, name: "暖垫音色", slug: "pad_1_new_age" }
] as const;

const supportedPrograms = gmInstruments.map((instrument) => instrument.program);
const sampleRoots = [
  { note: "C2", pitch: 36 },
  { note: "C3", pitch: 48 },
  { note: "C4", pitch: 60 },
  { note: "C5", pitch: 72 },
  { note: "C6", pitch: 84 }
];
const sampleCache = new Map<string, Promise<AudioBuffer>>();

export function createDefaultMelody(): MelodyClip {
  return {
    bpm: 120,
    bars: 1,
    beatsPerBar: defaultBeatsPerBar,
    beats: defaultBeatsPerBar,
    stepsPerBeat: defaultStepsPerBeat,
    sustain: true,
    tracks: [createMelodyTrack(0)]
  };
}

export function createMelodyTrack(index: number): MelodyTrack {
  return {
    id: crypto.randomUUID(),
    name: `音轨 ${index + 1}`,
    color: trackColors[index % trackColors.length],
    program: 0,
    volume: defaultTrackVolume,
    notes: []
  };
}

export function normalizeMelodyClip(clip?: Partial<MelodyClip>): MelodyClip {
  const beatsPerBar = clamp(Math.round(clip?.beatsPerBar ?? defaultBeatsPerBar), 1, 12);
  const legacyBeats = Math.max(1, Math.round(clip?.beats ?? beatsPerBar));
  const bars = clamp(Math.round(clip?.bars ?? Math.max(1, Math.ceil(legacyBeats / beatsPerBar))), 1, 64);
  const tracks = (clip?.tracks?.length ? clip.tracks : [createMelodyTrack(0)]).slice(0, 5).map((track, index) => ({
    id: track.id || crypto.randomUUID(),
    name: track.name || `音轨 ${index + 1}`,
    color: track.color || trackColors[index % trackColors.length],
    program: normalizeProgram(track.program ?? 0),
    volume: clamp(Math.round(track.volume || defaultTrackVolume), 1, 240),
    notes: (track.notes ?? []).map(normalizeNote)
  }));

  return {
    bpm: clamp(Math.round(clip?.bpm ?? 120), 40, 240),
    bars,
    beatsPerBar,
    beats: bars * beatsPerBar,
    stepsPerBeat: clamp(Math.round(clip?.stepsPerBeat ?? defaultStepsPerBeat), 1, 16),
    sustain: clip?.sustain ?? true,
    tracks
  };
}

export function writeMidi(clip: MelodyClip): Uint8Array {
  const normalized = normalizeMelodyClip(clip);
  const ticksPerStep = ticksPerQuarter / normalized.stepsPerBeat;
  const parts: number[] = [];

  parts.push(
    ...ascii("MThd"),
    ...u32(6),
    ...u16(1),
    ...u16(normalized.tracks.length + 1),
    ...u16(ticksPerQuarter)
  );
  parts.push(...writeTrack(writeTempoTrack(normalized.bpm)));

  for (const [index, track] of normalized.tracks.entries()) {
    parts.push(...writeTrack(writeNoteTrack(track, ticksPerStep, index)));
  }

  return new Uint8Array(parts);
}

export function parseMidi(bytes: Uint8Array): MelodyClip {
  const reader = new MidiReader(bytes);
  if (reader.readText(4) !== "MThd") {
    throw new Error("不是有效的 MIDI 文件。");
  }

  const headerLength = reader.readU32();
  reader.readU16();
  const trackCount = reader.readU16();
  const division = reader.readU16();
  reader.skip(headerLength - 6);

  if ((division & 0x8000) !== 0) {
    throw new Error("暂不支持 SMPTE 时间格式的 MIDI。");
  }

  let bpm = 120;
  const parsedTracks: MelodyTrack[] = [];

  for (let index = 0; index < trackCount; index += 1) {
    if (reader.readText(4) !== "MTrk") {
      throw new Error("MIDI 轨道数据不完整。");
    }

    const length = reader.readU32();
    const trackEnd = reader.offset + length;
    const parsed = parseTrack(reader, trackEnd, division, (tempo) => {
      bpm = Math.round(60_000_000 / tempo);
    });

    if (parsed.notes.length > 0 && parsedTracks.length < 5) {
      parsedTracks.push({
        id: crypto.randomUUID(),
        name: `音轨 ${parsedTracks.length + 1}`,
        color: trackColors[parsedTracks.length % trackColors.length],
        program: parsed.program,
        volume: parsed.volume,
        notes: parsed.notes
      });
    }

    reader.seek(trackEnd);
  }

  const tracks = parsedTracks.length > 0 ? parsedTracks : [createMelodyTrack(0)];
  const maxEnd = Math.max(16, ...tracks.flatMap((track) => track.notes.map((note) => note.start + note.duration)));
  const beats = Math.max(defaultBeatsPerBar, Math.ceil(maxEnd / defaultStepsPerBeat));

  return normalizeMelodyClip({
    bpm,
    bars: Math.ceil(beats / defaultBeatsPerBar),
    beatsPerBar: defaultBeatsPerBar,
    stepsPerBeat: defaultStepsPerBeat,
    tracks
  });
}

export type PlaybackControls = {
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isPaused: () => boolean;
};

type PlaybackTimer = {
  callback: () => void;
  dueAt: number;
  remaining: number;
  id?: number;
};

export function playMelody(
  clip: MelodyClip,
  options: { startStep?: number; trackId?: string; onStep?: (step: number) => void; onEnded?: () => void } = {}
): PlaybackControls {
  const normalized = normalizeMelodyClip(clip);
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  const secondsPerStep = 60 / normalized.bpm / normalized.stepsPerBeat;
  const startStep = Math.max(0, Math.round(options.startStep ?? 0));
  const oscillators: OscillatorNode[] = [];
  const sources: AudioBufferSourceNode[] = [];
  const timers: PlaybackTimer[] = [];
  let stopped = false;
  let paused = false;
  const tracks = options.trackId
    ? normalized.tracks.filter((track) => track.id === options.trackId)
    : normalized.tracks;

  function schedulePlaybackTimer(delayMs: number, callback: () => void) {
    const timer: PlaybackTimer = {
      callback,
      dueAt: performance.now() + Math.max(0, delayMs),
      remaining: Math.max(0, delayMs)
    };
    if (!paused) {
      timer.id = window.setTimeout(callback, timer.remaining);
    }
    timers.push(timer);
  }

  const programs = [...new Set(tracks.map((track) => track.program))];
  void Promise.all(programs.map((program) => loadInstrumentSamples(context, program))).then(() => {
    if (stopped) {
      return;
    }

    const readyAt = context.currentTime + 0.08;
    for (const track of tracks) {
      for (const note of track.notes) {
        const noteEndStep = note.start + Math.max(1, note.duration);
        if (noteEndStep <= startStep) {
          continue;
        }

        scheduleNote(
          context,
          oscillators,
          sources,
          note,
          track.program,
          track.volume,
          normalized.sustain,
          readyAt + Math.max(0, note.start - startStep) * secondsPerStep,
          secondsPerStep
        );
      }
    }

    if (options.onStep) {
      const maxStep = normalized.bars * normalized.beatsPerBar * normalized.stepsPerBeat;
      for (let step = startStep; step <= maxStep; step += 1) {
        schedulePlaybackTimer((readyAt - context.currentTime + (step - startStep) * secondsPerStep) * 1000, () => options.onStep?.(step));
      }
    }

    const maxStep = normalized.bars * normalized.beatsPerBar * normalized.stepsPerBeat;
    schedulePlaybackTimer((readyAt - context.currentTime + Math.max(1, maxStep - startStep) * secondsPerStep) * 1000 + 300, () => {
      if (!stopped) {
        stopped = true;
        void context.close();
        options.onEnded?.();
      }
    });
  });

  function stop() {
    stopped = true;
    for (const timer of timers) {
      if (timer.id !== undefined) {
        window.clearTimeout(timer.id);
      }
    }
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // 已自然结束的采样不需要处理。
      }
    }
    for (const oscillator of oscillators) {
      try {
        oscillator.stop();
      } catch {
        // 已自然结束的音符不需要处理。
      }
    }
    void context.close();
  }

  function pause() {
    if (stopped || paused) {
      return;
    }
    paused = true;
    const now = performance.now();
    for (const timer of timers) {
      if (timer.id !== undefined) {
        window.clearTimeout(timer.id);
        timer.id = undefined;
        timer.remaining = Math.max(0, timer.dueAt - now);
      }
    }
    void context.suspend();
  }

  function resume() {
    if (stopped || !paused) {
      return;
    }
    paused = false;
    const now = performance.now();
    for (const timer of timers) {
      if (timer.id === undefined) {
        timer.dueAt = now + timer.remaining;
        timer.id = window.setTimeout(timer.callback, timer.remaining);
      }
    }
    void context.resume();
  }

  return {
    stop,
    pause,
    resume,
    isPaused: () => paused
  };
}

export function previewMelodyNote(pitch: number, program = 0, durationSteps = 1, hold = false): () => void {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  const oscillators: OscillatorNode[] = [];
  const sources: AudioBufferSourceNode[] = [];
  let stopped = false;
  void loadInstrumentSamples(context, program).finally(() => {
    if (stopped) {
      return;
    }
    scheduleNote(
      context,
      oscillators,
      sources,
      { id: "preview", pitch, start: 0, duration: durationSteps, velocity: 100 },
      program,
      defaultTrackVolume,
      true,
      context.currentTime + 0.01,
      hold ? 60 : 0.22
    );
  });
  const timeout = hold ? undefined : window.setTimeout(() => stop(), Math.max(450, durationSteps * 260));

  function stop() {
    stopped = true;
    if (timeout !== undefined) {
      window.clearTimeout(timeout);
    }
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // 已结束的采样不需要处理。
      }
    }
    for (const oscillator of oscillators) {
      try {
        oscillator.stop();
      } catch {
        // 已结束的振荡器不需要处理。
      }
    }
    void context.close();
  }

  return stop;
}

export async function renderMelodyWav(clip: MelodyClip): Promise<Uint8Array> {
  const normalized = normalizeMelodyClip(clip);
  const sampleRate = 44_100;
  const secondsPerStep = 60 / normalized.bpm / normalized.stepsPerBeat;
  const totalSteps = normalized.bars * normalized.beatsPerBar * normalized.stepsPerBeat;
  const duration = Math.max(1, totalSteps * secondsPerStep + 1.2);
  const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const context = new OfflineContextClass(2, Math.ceil(duration * sampleRate), sampleRate);
  const programs = [...new Set(normalized.tracks.map((track) => track.program))];

  await Promise.all(programs.map((program) => loadInstrumentSamples(context, program)));

  const oscillators: OscillatorNode[] = [];
  const sources: AudioBufferSourceNode[] = [];
  for (const track of normalized.tracks) {
    for (const note of track.notes) {
      await scheduleOfflineNote(context, oscillators, sources, note, track.program, track.volume, normalized.sustain, note.start * secondsPerStep, secondsPerStep);
    }
  }

  const rendered = await context.startRendering();
  return encodeWav(rendered);
}

function writeTempoTrack(bpm: number): number[] {
  const tempo = Math.round(60_000_000 / clamp(bpm || 120, 40, 240));
  return [0x00, 0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff, 0x00, 0xff, 0x2f, 0x00];
}

function writeNoteTrack(track: MelodyTrack, ticksPerStep: number, trackIndex: number): number[] {
  const channel = trackIndex % 15;
  const events: Array<{ tick: number; data: number[]; order: number }> = [
    { tick: 0, data: [0xc0 | channel, clamp(track.program, 0, 127)], order: 0 },
    { tick: 0, data: [0xb0 | channel, 0x07, clamp(Math.round(track.volume || defaultTrackVolume), 1, 127)], order: 0 }
  ];

  for (const note of track.notes) {
    const start = Math.max(0, Math.round(note.start * ticksPerStep));
    const end = Math.max(start + 1, Math.round((note.start + Math.max(1, note.duration)) * ticksPerStep));
    const pitch = clamp(Math.round(note.pitch), 0, 127);
    const velocity = clamp(Math.round(note.velocity || 90), 1, 127);
    events.push({ tick: start, data: [0x90 | channel, pitch, velocity], order: 2 });
    events.push({ tick: end, data: [0x80 | channel, pitch, 0], order: 1 });
  }

  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  let cursor = 0;
  const data: number[] = [];
  for (const event of events) {
    data.push(...varLen(event.tick - cursor), ...event.data);
    cursor = event.tick;
  }
  data.push(0x00, 0xff, 0x2f, 0x00);
  return data;
}

function writeTrack(data: number[]): number[] {
  return [...ascii("MTrk"), ...u32(data.length), ...data];
}

function parseTrack(
  reader: MidiReader,
  end: number,
  division: number,
  onTempo: (tempo: number) => void
): { notes: MelodyNote[]; program: number; volume: number } {
  const active = new Map<string, { start: number; velocity: number }>();
  const programs = new Map<number, number>();
  const volumes = new Map<number, number>();
  const notes: MelodyNote[] = [];
  let tick = 0;
  let runningStatus = 0;

  while (reader.offset < end) {
    tick += reader.readVarLen();
    let status = reader.readU8();

    if (status < 0x80) {
      if (!runningStatus) {
        throw new Error("MIDI running status 无效。");
      }
      reader.back();
      status = runningStatus;
    } else if (status < 0xf0) {
      runningStatus = status;
    }

    if (status === 0xff) {
      const type = reader.readU8();
      const length = reader.readVarLen();
      if (type === 0x51 && length === 3) {
        onTempo((reader.readU8() << 16) | (reader.readU8() << 8) | reader.readU8());
      } else {
        reader.skip(length);
      }
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      reader.skip(reader.readVarLen());
      continue;
    }

    const command = status & 0xf0;
    const channel = status & 0x0f;
    const first = reader.readU8();
    const needsSecond = command !== 0xc0 && command !== 0xd0;
    const second = needsSecond ? reader.readU8() : 0;

    if (command === 0xc0) {
      programs.set(channel, first);
    } else if (command === 0xb0 && first === 0x07) {
      volumes.set(channel, second);
    } else if (command === 0x90 && second > 0) {
      active.set(`${channel}:${first}`, { start: tick, velocity: second });
    } else if (command === 0x80 || (command === 0x90 && second === 0)) {
      const key = `${channel}:${first}`;
      const started = active.get(key);
      if (started) {
        const stepStart = Math.round((started.start / division) * defaultStepsPerBeat);
        const stepEnd = Math.max(stepStart + 1, Math.round((tick / division) * defaultStepsPerBeat));
        notes.push({
          id: crypto.randomUUID(),
          pitch: first,
          start: stepStart,
          duration: stepEnd - stepStart,
          velocity: started.velocity
        });
        active.delete(key);
      }
    }
  }

  return { notes, program: programs.values().next().value ?? 0, volume: volumes.values().next().value ?? defaultTrackVolume };
}

function scheduleNote(
  context: BaseAudioContext,
  oscillators: OscillatorNode[],
  sources: AudioBufferSourceNode[],
  note: MelodyNote,
  program: number,
  trackVolume: number,
  sustain: boolean,
  noteStart: number,
  secondsPerStep: number
) {
  const sample = findNearestSample(program, note.pitch);
  const noteEnd = noteStart + Math.max(1, note.duration) * secondsPerStep;
  const audibleEnd = sustain ? noteEnd + Math.min(0.08, secondsPerStep * 0.35) : Math.min(noteEnd, noteStart + 0.28);
  const volume = clamp(note.velocity || 90, 1, 127) / 127;
  const trackGain = clamp(trackVolume || defaultTrackVolume, 1, 240) / 100;
  const instrumentGain = gainForProgram(program);
  const master = context.createGain();
  const peakGain = Math.max(0.015, volume * trackGain * instrumentGain);
  master.gain.setValueAtTime(0.0001, noteStart);
  master.gain.linearRampToValueAtTime(peakGain, noteStart + 0.003);
  master.gain.setValueAtTime(peakGain, Math.max(noteStart + 0.004, audibleEnd - (sustain ? 0.012 : 0.035)));
  master.gain.linearRampToValueAtTime(0.0001, audibleEnd + (sustain ? 0.035 : 0.06));
  master.connect(context.destination);

  const cached = sampleCache.get(sample.cacheKey);
  if (cached) {
    void cached.then((buffer) => {
      if (context.state === "closed") {
        return;
      }

      const source = context.createBufferSource();
      source.buffer = buffer;
      const playbackRate = 2 ** ((note.pitch - sample.rootPitch) / 12);
      source.playbackRate.setValueAtTime(playbackRate, noteStart);
      if (sustain && note.duration > 1 && buffer.duration > 0.12) {
        source.loop = true;
        source.loopStart = Math.min(0.06, buffer.duration * 0.25);
        source.loopEnd = Math.max(source.loopStart + 0.04, Math.min(buffer.duration - 0.01, buffer.duration * 0.92));
      }
      connectSampleSource(context, source, master, program, playbackRate, noteStart, audibleEnd);
      const sampleOffset = Math.min(0.025, buffer.duration * 0.1);
      source.start(noteStart, sampleOffset);
      source.stop(audibleEnd + 0.08);
      sources.push(source);
    });
    return;
  }

  scheduleFallbackOscillator(context, oscillators, note, program, trackVolume, sustain, noteStart, secondsPerStep);
}

async function scheduleOfflineNote(
  context: OfflineAudioContext,
  oscillators: OscillatorNode[],
  sources: AudioBufferSourceNode[],
  note: MelodyNote,
  program: number,
  trackVolume: number,
  sustain: boolean,
  noteStart: number,
  secondsPerStep: number
) {
  const sample = findNearestSample(program, note.pitch);
  const buffer = await sampleCache.get(sample.cacheKey);
  if (!buffer) {
    scheduleFallbackOscillator(context, oscillators, note, program, trackVolume, sustain, noteStart, secondsPerStep);
    return;
  }

  const noteEnd = noteStart + Math.max(1, note.duration) * secondsPerStep;
  const audibleEnd = sustain ? noteEnd + Math.min(0.08, secondsPerStep * 0.35) : Math.min(noteEnd, noteStart + 0.28);
  const volume = clamp(note.velocity || 90, 1, 127) / 127;
  const trackGain = clamp(trackVolume || defaultTrackVolume, 1, 240) / 100;
  const instrumentGain = gainForProgram(program);
  const master = context.createGain();
  const peakGain = Math.max(0.015, volume * trackGain * instrumentGain);
  master.gain.setValueAtTime(0.0001, noteStart);
  master.gain.linearRampToValueAtTime(peakGain, noteStart + 0.003);
  master.gain.setValueAtTime(peakGain, Math.max(noteStart + 0.004, audibleEnd - (sustain ? 0.012 : 0.035)));
  master.gain.linearRampToValueAtTime(0.0001, audibleEnd + (sustain ? 0.035 : 0.06));
  master.connect(context.destination);

  const source = context.createBufferSource();
  source.buffer = buffer;
  const playbackRate = 2 ** ((note.pitch - sample.rootPitch) / 12);
  source.playbackRate.setValueAtTime(playbackRate, noteStart);
  if (sustain && note.duration > 1 && buffer.duration > 0.12) {
    source.loop = true;
    source.loopStart = Math.min(0.06, buffer.duration * 0.25);
    source.loopEnd = Math.max(source.loopStart + 0.04, Math.min(buffer.duration - 0.01, buffer.duration * 0.92));
  }
  connectSampleSource(context, source, master, program, playbackRate, noteStart, audibleEnd);
  source.start(noteStart, Math.min(0.025, buffer.duration * 0.1));
  source.stop(audibleEnd + 0.08);
  sources.push(source);
}

function connectSampleSource(
  context: BaseAudioContext,
  source: AudioBufferSourceNode,
  master: GainNode,
  program: number,
  playbackRate: number,
  noteStart: number,
  audibleEnd: number
) {
  if (normalizeProgram(program) !== 16) {
    source.connect(master);
    return;
  }

  const tremolo = context.createGain();
  source.connect(tremolo).connect(master);

  const rate = 6.2;
  const vibratoCents = 9;
  const tremoloDepth = 0.16;
  const step = 1 / 36;
  for (let time = noteStart; time <= audibleEnd + 0.08; time += step) {
    const phase = (time - noteStart) * rate * Math.PI * 2;
    source.playbackRate.linearRampToValueAtTime(playbackRate * 2 ** ((Math.sin(phase) * vibratoCents) / 1200), time);
    tremolo.gain.linearRampToValueAtTime(1 - tremoloDepth * 0.5 + Math.sin(phase) * tremoloDepth * 0.5, time);
  }
}

async function loadInstrumentSamples(context: BaseAudioContext, program: number): Promise<void> {
  const instrument = instrumentForProgram(program);
  await Promise.all(
    sampleRoots.map(async (root) => {
      const cacheKey = `${instrument.slug}/${root.note}`;
      if (!sampleCache.has(cacheKey)) {
        const promise = fetch(`/soundfonts/FluidR3_GM/${instrument.slug}/${root.note}.mp3`)
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Missing sample: ${cacheKey}`);
            }
            return response.arrayBuffer();
          })
          .then((data) => context.decodeAudioData(data.slice(0)));
        sampleCache.set(cacheKey, promise);
      }

      await sampleCache.get(cacheKey);
    })
  );
}

function findNearestSample(program: number, pitch: number): { cacheKey: string; rootPitch: number } {
  const instrument = instrumentForProgram(program);
  let nearest = sampleRoots[0];
  let nearestDistance = Math.abs(pitch - nearest.pitch);

  for (const root of sampleRoots) {
    const distance = Math.abs(pitch - root.pitch);
    if (distance < nearestDistance) {
      nearest = root;
      nearestDistance = distance;
    }
  }

  return {
    cacheKey: `${instrument.slug}/${nearest.note}`,
    rootPitch: nearest.pitch
  };
}

function instrumentForProgram(program: number): (typeof gmInstruments)[number] {
  const normalized = normalizeProgram(program);
  return gmInstruments.find((instrument) => instrument.program === normalized) ?? gmInstruments[0];
}

function gainForProgram(program: number): number {
  const normalized = normalizeProgram(program);
  if (normalized === 88) {
    return 6.4;
  }
  if (normalized === 48) {
    return 5.2;
  }
  if (normalized === 73) {
    return 4.6;
  }
  if (normalized === 16) {
    return 5.8;
  }
  if (normalized === 6 || normalized === 80 || normalized === 81) {
    return 3.4;
  }
  return 4.2;
}

function scheduleFallbackOscillator(
  context: BaseAudioContext,
  oscillators: OscillatorNode[],
  note: MelodyNote,
  program: number,
  trackVolume: number,
  sustain: boolean,
  noteStart: number,
  secondsPerStep: number
) {
  const timbre = timbreForProgram(program);
  const noteEnd = noteStart + (sustain ? Math.max(1, note.duration) * secondsPerStep : Math.min(0.28, Math.max(1, note.duration) * secondsPerStep));
  const volume = clamp(note.velocity || 90, 1, 127) / 127;
  const trackGain = clamp(trackVolume || defaultTrackVolume, 1, 240) / 100;
  const frequency = midiPitchToFrequency(note.pitch);
  const master = context.createGain();
  const filter = context.createBiquadFilter();

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(timbre.filterFrequency, noteStart);
  filter.Q.setValueAtTime(timbre.filterQ, noteStart);
  master.gain.setValueAtTime(0.0001, noteStart);
  master.gain.exponentialRampToValueAtTime(Math.max(0.015, volume * trackGain * timbre.gain), noteStart + timbre.attack);
  if (timbre.decay > 0) {
    master.gain.exponentialRampToValueAtTime(Math.max(0.01, volume * trackGain * timbre.gain * timbre.sustain), noteStart + timbre.attack + timbre.decay);
  }
  master.gain.exponentialRampToValueAtTime(0.0001, noteEnd + timbre.release);
  filter.connect(master).connect(context.destination);

  for (const layer of timbre.layers) {
    const oscillator = context.createOscillator();
    const layerGain = context.createGain();
    oscillator.type = layer.type;
    oscillator.frequency.setValueAtTime(frequency * layer.ratio, noteStart);
    oscillator.detune.setValueAtTime(layer.detune, noteStart);
    if (normalizeProgram(program) === 16) {
      for (let time = noteStart; time <= noteEnd + timbre.release; time += 1 / 36) {
        oscillator.detune.linearRampToValueAtTime(layer.detune + Math.sin((time - noteStart) * 6.2 * Math.PI * 2) * 9, time);
      }
    }
    layerGain.gain.setValueAtTime(layer.gain, noteStart);
    oscillator.connect(layerGain).connect(filter);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + timbre.release + 0.04);
  oscillators.push(oscillator);
  }
}

function encodeWav(buffer: AudioBuffer): Uint8Array {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const frameCount = buffer.length;
  const dataSize = frameCount * channels * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  let offset = 0;

  writeAsciiToView(view, offset, "RIFF");
  offset += 4;
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeAsciiToView(view, offset, "WAVE");
  offset += 4;
  writeAsciiToView(view, offset, "fmt ");
  offset += 4;
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, channels, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * channels * 2, true);
  offset += 4;
  view.setUint16(offset, channels * 2, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeAsciiToView(view, offset, "data");
  offset += 4;
  view.setUint32(offset, dataSize, true);
  offset += 4;

  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  for (let index = 0; index < frameCount; index += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][index] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return bytes;
}

function writeAsciiToView(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

type SynthLayer = {
  type: OscillatorType;
  ratio: number;
  detune: number;
  gain: number;
};

type SynthTimbre = {
  layers: SynthLayer[];
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  gain: number;
  filterFrequency: number;
  filterQ: number;
};

function timbreForProgram(program: number): SynthTimbre {
  if (program === 16) {
    return {
      layers: [
        { type: "square", ratio: 1, detune: 0, gain: 0.55 },
        { type: "sine", ratio: 2, detune: 0, gain: 0.25 }
      ],
      attack: 0.015,
      decay: 0,
      sustain: 0.82,
      release: 0.08,
      gain: 0.18,
      filterFrequency: 3800,
      filterQ: 0.4
    };
  }
  if (program === 6) {
    return {
      layers: [
        { type: "square", ratio: 1, detune: 0, gain: 0.5 },
        { type: "triangle", ratio: 2, detune: 0, gain: 0.16 }
      ],
      attack: 0.003,
      decay: 0.13,
      sustain: 0.12,
      release: 0.045,
      gain: 0.16,
      filterFrequency: 4200,
      filterQ: 1.1
    };
  }
  if (program === 24) {
    return {
      layers: [
        { type: "sawtooth", ratio: 1, detune: -6, gain: 0.55 },
        { type: "triangle", ratio: 2, detune: 4, gain: 0.18 }
      ],
      attack: 0.006,
      decay: 0.18,
      sustain: 0.22,
      release: 0.08,
      gain: 0.17,
      filterFrequency: 2400,
      filterQ: 1.2
    };
  }
  if (program === 32) {
    return {
      layers: [
        { type: "sawtooth", ratio: 0.5, detune: 0, gain: 0.65 },
        { type: "triangle", ratio: 1, detune: 0, gain: 0.25 }
      ],
      attack: 0.012,
      decay: 0.12,
      sustain: 0.45,
      release: 0.1,
      gain: 0.22,
      filterFrequency: 1100,
      filterQ: 0.8
    };
  }
  if (program === 48) {
    return {
      layers: [
        { type: "sine", ratio: 1, detune: -9, gain: 0.32 },
        { type: "sine", ratio: 1, detune: 8, gain: 0.32 },
        { type: "triangle", ratio: 2, detune: 2, gain: 0.18 }
      ],
      attack: 0.2,
      decay: 0,
      sustain: 0.9,
      release: 0.38,
      gain: 0.19,
      filterFrequency: 2400,
      filterQ: 0.35
    };
  }
  if (program === 56) {
    return {
      layers: [
        { type: "sawtooth", ratio: 1, detune: 0, gain: 0.48 },
        { type: "square", ratio: 1, detune: 7, gain: 0.22 }
      ],
      attack: 0.035,
      decay: 0.08,
      sustain: 0.68,
      release: 0.14,
      gain: 0.16,
      filterFrequency: 4200,
      filterQ: 0.9
    };
  }
  if (program === 73) {
    return {
      layers: [
        { type: "sine", ratio: 1, detune: 0, gain: 0.62 },
        { type: "triangle", ratio: 2, detune: 0, gain: 0.08 }
      ],
      attack: 0.045,
      decay: 0.04,
      sustain: 0.76,
      release: 0.18,
      gain: 0.15,
      filterFrequency: 5200,
      filterQ: 0.25
    };
  }
  if (program === 80 || program === 81) {
    return {
      layers: [
        { type: program === 80 ? "square" : "sawtooth", ratio: 1, detune: -5, gain: 0.55 },
        { type: "sawtooth", ratio: 1, detune: 5, gain: 0.28 }
      ],
      attack: 0.006,
      decay: 0.05,
      sustain: 0.72,
      release: 0.08,
      gain: 0.15,
      filterFrequency: 5200,
      filterQ: 0.5
    };
  }
  if (program === 88) {
    return {
      layers: [
        { type: "sine", ratio: 1, detune: -8, gain: 0.48 },
        { type: "triangle", ratio: 2, detune: 6, gain: 0.2 }
      ],
      attack: 0.18,
      decay: 0,
      sustain: 0.86,
      release: 0.35,
      gain: 0.17,
      filterFrequency: 2600,
      filterQ: 0.3
    };
  }
  if (program === 4 || program === 5) {
    return {
      layers: [
        { type: "sine", ratio: 1, detune: 0, gain: 0.45 },
        { type: "triangle", ratio: 3, detune: 0, gain: 0.2 }
      ],
      attack: 0.01,
      decay: 0.22,
      sustain: 0.34,
      release: 0.14,
      gain: 0.2,
      filterFrequency: 3600,
      filterQ: 0.7
    };
  }
  return {
    layers: [
      { type: "triangle", ratio: 1, detune: 0, gain: 0.55 },
      { type: "sine", ratio: 2, detune: 0, gain: 0.18 }
    ],
    attack: 0.008,
    decay: 0.2,
    sustain: 0.26,
    release: 0.12,
    gain: 0.24,
    filterFrequency: 5000,
    filterQ: 0.5
  };
}

function normalizeNote(note: MelodyNote): MelodyNote {
  return {
    ...note,
    id: note.id || crypto.randomUUID(),
    pitch: clamp(Math.round(note.pitch), 0, 127),
    start: Math.max(0, Math.round(note.start)),
    duration: Math.max(1, Math.round(note.duration)),
    velocity: clamp(Math.round(note.velocity || 90), 1, 127)
  };
}

function normalizeProgram(program: number): number {
  const safeProgram = clamp(Math.round(program), 0, 127);
  let closest = supportedPrograms[0] ?? 0;
  let closestDistance = Math.abs(safeProgram - closest);

  for (const supported of supportedPrograms) {
    const distance = Math.abs(safeProgram - supported);
    if (distance < closestDistance) {
      closest = supported;
      closestDistance = distance;
    }
  }

  return closest;
}

function midiPitchToFrequency(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u32(value: number): number[] {
  return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function varLen(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes = [buffer];
  while ((value >>= 7) > 0) {
    buffer = (value & 0x7f) | 0x80;
    bytes.unshift(buffer);
  }
  return bytes;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

class MidiReader {
  offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  readText(length: number): string {
    const value = String.fromCharCode(...this.bytes.slice(this.offset, this.offset + length));
    this.offset += length;
    return value;
  }

  readU8(): number {
    return this.bytes[this.offset++] ?? 0;
  }

  readU16(): number {
    return (this.readU8() << 8) | this.readU8();
  }

  readU32(): number {
    return (this.readU8() << 24) | (this.readU8() << 16) | (this.readU8() << 8) | this.readU8();
  }

  readVarLen(): number {
    let value = 0;
    let byte = 0;
    do {
      byte = this.readU8();
      value = (value << 7) | (byte & 0x7f);
    } while ((byte & 0x80) !== 0);
    return value;
  }

  back() {
    this.offset = Math.max(0, this.offset - 1);
  }

  skip(length: number) {
    this.offset += Math.max(0, length);
  }

  seek(offset: number) {
    this.offset = offset;
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
