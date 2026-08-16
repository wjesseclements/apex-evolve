/**
 * Registry of the hand-authored tracks shipped with the app. Track JSON is
 * validated at build time (module load) so a malformed file fails fast.
 */
import heldoutJson from './data/heldout.json' with { type: 'json' };
import trainingJson from './data/training.json' with { type: 'json' };
import { buildTrack, parseTrackData, type Track } from './track.ts';

/** Track A: clockwise, right-handers dominate, 440 m. The default run trains here. */
export const TRAINING_TRACK: Track = buildTrack(parseTrackData(trainingJson));
/** Track B: counter-clockwise, left-handers dominate, one right kink, a 100 m straight, R 16–34, 509 m. Held out. */
export const HELDOUT_TRACK: Track = buildTrack(parseTrackData(heldoutJson));

export type TrackId = 'training' | 'heldout';
export const TRACK_IDS: readonly TrackId[] = ['training', 'heldout'];

export const TRACKS: Readonly<Record<TrackId, Track>> = {
  training: TRAINING_TRACK,
  heldout: HELDOUT_TRACK,
};

export function isTrackId(v: string): v is TrackId {
  return v === 'training' || v === 'heldout';
}
