// Loads the classic-script libs the same way the manifest does (they attach to globalThis.RL).
import '../../src/lib/state.js';
import '../../src/lib/settings.js';
import '../../src/lib/audio-graph.js';

export const RL = globalThis.RL;
