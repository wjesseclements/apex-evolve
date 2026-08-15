/**
 * Registry of the hand-authored tracks shipped with the app. Track JSON is
 * validated at build time (module load) so a malformed file fails fast.
 */
import trainingJson from './data/training.json';
import { buildTrack, parseTrackData, type Track } from './track.ts';

export const TRAINING_TRACK: Track = buildTrack(parseTrackData(trainingJson));

export const TRACKS: Readonly<Record<string, Track>> = {
  training: TRAINING_TRACK,
};
