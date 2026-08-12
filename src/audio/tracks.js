// tracks.js — the composed music for every pinned track id. Pure data; the
// sequencer that plays it lives in music.js.
//
// Pattern notation (parsed by music.js#parsePattern), tokens are whitespace
// separated and read left to right on a fixed-size step grid (`step`, e.g.
// '8n' = eighth note):
//   .          rest, one step        .*N   rest, N steps
//   _          tie: extend the previous note by one more step
//   G4         a note (one step long)     G4*3   hold it for 3 steps
//   C4+E4+G4   a chord (any of the note forms above, joined by "+")
// Each part loops on its own natural length (however many beats its tokens
// add up to). Foundation parts (pad/bass/choir) are written to share a
// common loop length per track so the harmony locks; decorative layers
// (bell/arp/extra pluck) are deliberately left free-length so the overall
// soundscape never quite repeats the same way twice — see ARCHITECTURE.md's
// "2+ alternating sections" note. `wet` is this track's reverb-send amount
// (0..1, passed straight to music.js's per-layer convolver tap).
//
// The Lumen motif — G4 A4 C5 E5 D5 G5 — appears verbatim in title, town,
// awakening and victory, and in a minor/fragmented transformation (G A C
// Eb D G, slowed and spaced with rests) in spire and battle_boss, per the
// Design Bible's audio direction (§9).

export const TRACKS = {
  // ---------------------------------------------------------------- Title
  title: {
    name: 'Lumenfall Theme', key: 'G', mode: 'mixolydian', tempo: 72, swing: 0,
    meter: [4, 4], wet: 0.42,
    parts: {
      pad: {
        voice: 'warmPad', step: '2n', gain: 0.36,
        pattern: 'G3+B3+D4*2 C3+E3+G3*2 E3+G3+B3*2 D3+F#3+A3*2 G3+B3+D4*2 A3+C4+E4*2 C3+E3+G3*2 D3+F#3+A3*2',
      },
      bass: {
        voice: 'bass', step: '4n', gain: 0.5,
        pattern: 'G2*4 C2*4 E2*4 D2*4 G2*4 A2*4 C2*4 D2*4',
      },
      melody: {
        voice: 'flute', step: '8n', gain: 0.88,
        pattern: '.*16 G4 A4 C5*2 E5*2 D5*2 G5*3 . . F#5 E5*2 D5*2 C5*2 B4*2 A4*3 . . G4*4 A4*2 B4*2 C5*4 D5*6 E5*3',
      },
      bell: {
        voice: 'bell', step: '4n', gain: 0.42,
        pattern: '.*8 G4 . A4 . C5 . E5 . D5 . G5*2 .*6 D5 . B4 .*4 G4*2',
      },
    },
  },

  // ----------------------------------------------------------------- Town
  town: {
    name: 'Brighthollow', key: 'C', mode: 'major (3/4 lilt)', tempo: 100, swing: 0.1,
    meter: [3, 4], wet: 0.28,
    parts: {
      pad: {
        voice: 'warmPad', step: '4n', gain: 0.3,
        pattern: 'C3+E3+G3*3 F3+A3+C4*3 G3+B3+D4*3 C3+E3+G3*3 A3+C4+E4*3 D3+F3+A3*3 G3+B3+D4*3 C3+E3+G3*3',
      },
      waltz: {
        voice: 'pluck', step: '4n', gain: 0.5,
        pattern: 'C3 G3 E3 F3 C4 A3 G3 D4 B3 C3 G3 E3 A3 E4 C4 D3 A3 F3 G3 D4 B3 C3 G3 E3',
      },
      melody: {
        voice: 'flute', step: '8n', gain: 0.85,
        // beat 17 falls on the D-minor pad chord (D3+F3+A3) — the motif quote's
        // descent is reharmonized to F5 there so the borrowed F# never clashes.
        pattern: '.*6 E4 G4 C5*2 . B4 A4*2 . G4 A4 B4 C5*2 . . G4 A4 C5*2 E5*2 D5*2 G5*3 . F5 E5*2 D5 C5 B4*2 . A4 G4*2 . . .',
      },
    },
  },

  // --------------------------------------------------------------- Meadow
  meadow: {
    name: 'Dawnmeadow', key: 'G', mode: 'major pentatonic', tempo: 118, swing: 0,
    meter: [4, 4], wet: 0.2,
    parts: {
      pad: {
        voice: 'warmPad', step: '2n', gain: 0.26,
        pattern: 'G3+D4*2 A3+E4*2 E3+B3*2 G3+D4*2 A3+E4*2 B3+D4*2 G3+D4*2 A3+E4*2',
      },
      bass: {
        voice: 'bass', step: '4n', gain: 0.48,
        pattern: 'G2*2 D3*2 A2*2 E3*2 E2*2 B2*2 G2*2 D3*2 A2*2 E3*2 B2*2 D3*2 G2*2 D3*2 A2*2 E3*2',
      },
      melody: {
        voice: 'flute', step: '8n', gain: 0.8,
        // 18 beats of phrase + 14 beats of rest = exactly 32, so every re-entry
        // lands back on the G3+D4 downbeat of the pad/bass foundation.
        pattern: 'G4 A4 B4 . D5 B4 A4 . G4 A4 D5 B4 A4 G4*2 . E5 D5 B4 A4 G4*2 . A4 B4 D5*2 E5*2 D5 B4 A4*2 G4*3 .*28',
      },
      arp: {
        voice: 'arp', step: '16n', gain: 0.26,
        pattern: 'G5 A5 B5 D6 B5 A5 G5 E5 .*8 G5 A5 B5 D6 B5 A5 G5 E5 .*8',
      },
    },
  },

  // -------------------------------------------------------------- Forest
  forest: {
    name: 'Whisperwood', key: 'D', mode: 'dorian', tempo: 86, swing: 0,
    meter: [4, 4], wet: 0.4,
    parts: {
      choir: {
        voice: 'choir', step: '2n', gain: 0.28,
        pattern: 'D3+F3+A3*2 C3+E3+G3*2 F3+A3+C4*2 G3+B3+D4*2 D3+F3+A3*2 A3+C4+E4*2 C3+E3+G3*2 G3+B3+D4*2',
      },
      bass: {
        voice: 'bass', step: '4n', gain: 0.48,
        pattern: 'D2*4 C2*4 F2*4 G2*4 D2*4 A2*4 C2*4 G2*4',
      },
      flute: {
        voice: 'flute', step: '8n', gain: 0.42,
        // 23 beats of phrase padded to 32 so the melody re-enters on the chord.
        pattern: '.*8 D4 F4 A4*2 .*4 G4 F4 E4*2 .*6 C5 A4 F4*2 .*4 E4 D4*3 .*8 .*18',
      },
      bell: {
        voice: 'bell', step: '4n', gain: 0.3,
        pattern: '.*6 D4 .*5 A4 .*5 F4 .*5 C5 .*5',
      },
    },
  },

  // ---------------------------------------------------------------- Cave
  cave: {
    name: 'Gloamcavern', key: 'A', mode: 'aeolian, sparse', tempo: 70, swing: 0,
    meter: [4, 4], wet: 0.58,
    parts: {
      bass: {
        voice: 'bass', step: '4n', gain: 0.42,
        pattern: 'A2*8 E2*8 A2*8 G2*8',
      },
      drone: {
        voice: 'choir', step: '2n', gain: 0.18,
        pattern: 'A3+C4+E4*4 G3+C4+E4*4 A3+C4+E4*4 G3+B3+D4*4',
      },
      bell: {
        voice: 'bell', step: '4n', gain: 0.5,
        pattern: '.*8 A4 .*7 E5 .*7 C5 .*6 G4',
      },
    },
  },

  // ---------------------------------------------------------------- Lake
  lake: {
    name: 'Mirrorlake', key: 'G', mode: 'lydian', tempo: 92, swing: 0,
    meter: [4, 4], wet: 0.36,
    parts: {
      pad: {
        voice: 'warmPad', step: '2n', gain: 0.3,
        pattern: 'G3+B3+D4*2 D3+F#3+A3*2 E3+G3+B3*2 A3+C#4+E4*2 G3+B3+D4*2 D3+F#3+A3*2 E3+G3+B3*2 A3+C#4+E4*2',
      },
      bass: {
        voice: 'bass', step: '4n', gain: 0.44,
        pattern: 'G2*4 D2*4 E2*4 A2*4 G2*4 D2*4 E2*4 A2*4',
      },
      flute: {
        voice: 'flute', step: '8n', gain: 0.68,
        // 26 beats of phrase padded to 32 so the melody re-enters on the chord.
        pattern: '.*8 G4*2 B4*2 D5*3 . F#5*2 E5*2 D5*3 . B4*2 A4*2 G4*4 .*4 D5*2 C#5*2 B4*3 . A4*2 G4*2 D4*4 .*12',
      },
      arp: {
        voice: 'arp', step: '16n', gain: 0.22,
        pattern: 'G4 B4 D5 F#5 D5 B4 .*2 A4 C#5 E5 C#5 A4 .*3 G4 B4 D5 F#5 A5 F#5 D5 B4 .*8',
      },
    },
  },

  // ------------------------------------------------------------ Mountain
  mountain: {
    name: 'Skyreach Pass', key: 'A', mode: 'aeolian, driving', tempo: 132, swing: 0,
    meter: [4, 4], wet: 0.3,
    parts: {
      bass: {
        voice: 'bass', step: '8n', gain: 0.62,
        pattern: 'A2 A2 A2 A2 A2 A2 A2 A2 F2 F2 F2 F2 F2 F2 F2 F2 C2 C2 C2 C2 C2 C2 C2 C2 G2 G2 G2 G2 G2 G2 G2 G2',
      },
      choir: {
        voice: 'choir', step: '2n', gain: 0.3,
        pattern: 'A3+C4+E4*2 F3+A3+C4*2 C3+E3+G3*2 G3+B3+D4*2',
      },
      hook: {
        voice: 'bell', step: '4n', gain: 0.55,
        pattern: 'E4 . A4 . C5 . E5 . D5 . C5 . A4 . G4 .',
      },
      pluck: {
        voice: 'pluck', step: '8n', gain: 0.36,
        pattern: 'E3 . A3 . C4 . E4 . D4 . C4 . A3 . G3 .',
      },
    },
  },

  // --------------------------------------------------------------- Ruins
  ruins: {
    name: 'Sunken Ruins', key: 'E', mode: 'phrygian, choral', tempo: 76, swing: 0,
    meter: [4, 4], wet: 0.52,
    parts: {
      choir: {
        voice: 'choir', step: '2n', gain: 0.36,
        pattern: 'E3+G3+B3*2 F3+A3+C4*2 G3+B3+D4*2 E3+G3+B3*2 C3+E3+G3*2 D3+F3+A3*2 E3+G3+B3*2 F3+A3+C4*2',
      },
      bass: {
        voice: 'bass', step: '4n', gain: 0.44,
        pattern: 'E2*4 F2*4 G2*4 E2*4 C2*4 D2*4 E2*4 F2*4',
      },
      bell: {
        voice: 'bell', step: '4n', gain: 0.4,
        pattern: '.*4 E4 . B4 . G4 .*4 D4 . A4 . F4 .*4 C4 . G4 . E4 .*4 B3 . D4 .',
      },
    },
  },

  // --------------------------------------------------------------- Spire
  spire: {
    name: 'Hollow Spire', key: 'G', mode: 'minor, deep drone', tempo: 64, swing: 0,
    meter: [4, 4], wet: 0.56,
    parts: {
      drone: {
        voice: 'bass', step: '1n', gain: 0.56,
        pattern: 'G1*2 D2*2 G1*2 Eb2*2',
      },
      choir: {
        voice: 'choir', step: '2n', gain: 0.3,
        pattern: 'G3+Bb3+D4*2 Eb3+G3+Bb3*2 D3+F3+A3*2 G3+Bb3+D4*2 C3+Eb3+G3*2 D3+F3+A3*2 G3+Bb3+D4*2 Eb3+G3+Bb3*2',
      },
      // transformed Lumen motif: G A C E D G -> minor 6th (Eb), slowed, spaced.
      motif: {
        voice: 'bell', step: '2n', gain: 0.46,
        pattern: '.*4 G3*2 . A3*2 . C4*2 . Eb4*2 . D4*2 . G3*4',
      },
    },
  },

  // --------------------------------------------------------------- Glade
  glade: {
    name: 'Starfall Glade', key: 'G', mode: 'major, intimate dusk', tempo: 80, swing: 0,
    meter: [4, 4], wet: 0.34,
    parts: {
      pad: {
        voice: 'warmPad', step: '2n', gain: 0.28,
        pattern: 'G3+B3+D4*2 E3+G3+B3*2 C3+E3+G3*2 D3+F#3+A3*2 G3+B3+D4*2 E3+G3+B3*2 C3+E3+G3*2 D3+F#3+A3*2',
      },
      bass: {
        voice: 'bass', step: '4n', gain: 0.4,
        pattern: 'G2*4 E2*4 C2*4 D2*4 G2*4 E2*4 C2*4 D2*4',
      },
      flute: {
        voice: 'flute', step: '8n', gain: 0.6,
        // 23.5 beats of phrase padded to 32 so the melody re-enters on the chord.
        pattern: '.*8 D5 B4 G4*2 . A4 B4 C5*2 . D5 C5 B4*2 . A4 G4*3 .*4 B4 D5 G5*2 . E5 D5 C5*2 . B4 A4 G4*4 .*17',
      },
      bell: {
        voice: 'bell', step: '4n', gain: 0.3,
        pattern: '.*6 D5 .*5 G5 .*5 B4 .*5 E5 .*4',
      },
    },
  },

  // --------------------------------------------------------- Battle: wild
  // 8-bar AB form (32 beats): A circles the E pedal, B lifts to G/A/C ground
  // with a higher hook — real rising energy, not just a repeat.
  battle_wild: {
    name: 'Wild Encounter', key: 'E', mode: 'aeolian', tempo: 140, swing: 0,
    meter: [4, 4], wet: 0.2,
    parts: {
      bass: {
        voice: 'bass', step: '8n', gain: 0.66,
        pattern: 'E2 E2 G2 E2 E2 E2 B2 E2 E2 E2 G2 E2 E2 D2 B1 E2 '
          + 'E2 E2 G2 E2 E2 E2 B2 E2 E2 E2 G2 E2 E2 D2 E2 E2 '
          + 'G2 G2 B2 G2 G2 G2 D3 G2 A2 A2 C3 A2 A2 G2 E2 A2 '
          + 'C2 C2 G2 C2 C2 C2 G2 C2 D2 D2 A2 D2 D2 E2 F#2 B1',
      },
      hook: {
        voice: 'pluck', step: '8n', gain: 0.55,
        pattern: '. . E4 G4 B4 . G4 E4 . . D4 E4 G4 . E4 B3 '
          + '. . E4 G4 B4 . D5 B4 . . G4 E4 D4 . B3 . '
          + '. . B4 D5 E5 . D5 B4 . . C5 D5 E5 . C5 A4 '
          + '. . D5 E5 G5 . E5 D5 . . E5 D5 B4 . A4 .',
      },
      arp: {
        voice: 'arp', step: '16n', gain: 0.24,
        pattern: 'E5 G5 B5 E6 .*12 B4 D5 G5 B5 .*12 E5 G5 B5 E6 .*12 A4 C5 E5 A5 C6 A5 E5 C5 .*8',
      },
    },
  },

  // ------------------------------------------------------- Battle: warden
  // Deliberately NOT the wild loop in D: martial dotted rhythm with rests
  // (staccato drive), a long-note heroic bell contour instead of the wild
  // eighth-note tumble, and a full Dm-C-Bb-A / Dm-F-Bb-A choir ground.
  battle_warden: {
    name: 'Warden Duel', key: 'D', mode: 'aeolian, heroic', tempo: 146, swing: 0,
    meter: [4, 4], wet: 0.22,
    parts: {
      bass: {
        voice: 'bass', step: '8n', gain: 0.68,
        pattern: 'D2 D2 . A2 D2 . F2 A2 C2 C2 . G2 C2 . E2 G2 '
          + 'Bb1 Bb1 . F2 Bb1 . D2 F2 A1 A1 . E2 A2 . G2 E2 '
          + 'D2 D2 F2 A2 D3 . A2 F2 F2 F2 . C3 F2 . A2 C3 '
          + 'Bb1 Bb2 . F2 Bb2 . D3 F2 A1 A2 . E2 A2 C#3 E3 E2',
      },
      hook: {
        voice: 'bell', step: '8n', gain: 0.5,
        pattern: 'D5 . . A4 . . D5 E5 F5 . . E5 . . C5 D5 '
          + 'F5 . . D5 . . Bb4 C5 A4 . . C#5 . . E5 . '
          + 'D5 . E5 F5 . G5 A5 . A5 . G5 F5 . E5 C5 . '
          + 'Bb4 . D5 F5 . G5 F5 D5 E5 . C#5 . E5 A4 . .',
      },
      choir: {
        voice: 'choir', step: '2n', gain: 0.26,
        pattern: 'D3+F3+A3*2 C3+E3+G3*2 Bb2+D3+F3*2 A2+C#3+E3*2 D3+F3+A3*2 F3+A3+C4*2 Bb2+D3+F3*2 A2+C#3+E3*2',
      },
    },
  },

  // --------------------------------------------------------- Battle: boss
  // Bass + choir extended to four 5/4 bars: the ostinato darkens (F, then Bb
  // and a climbing Eb-D turn) instead of looping a single bar.
  battle_boss: {
    name: 'The Hollow Order', key: 'G', mode: 'minor, 5/4 ostinato', tempo: 120, swing: 0,
    meter: [5, 4], wet: 0.4,
    parts: {
      bass: {
        voice: 'bass', step: '8n', gain: 0.74,
        pattern: 'G1 G1 G1 D2 G1 G1 G1 D2 Eb2 D2 '
          + 'G1 G1 G1 D2 G1 G1 G1 D2 F2 D2 '
          + 'G1 G1 Bb1 D2 G1 G1 Bb1 D2 Eb2 F2 '
          + 'G1 G1 C2 D2 Eb2 Eb2 D2 C2 Bb1 D2',
      },
      choir: {
        voice: 'choir', step: '4n', gain: 0.34,
        pattern: 'G3+Bb3+D4*3 Eb3+G3+Bb3*2 G3+Bb3+D4*3 F3+A3+C4*2 G3+Bb3+D4*3 Eb3+G3+Bb3*2 C3+Eb3+G3*2 D3+F3+A3*3',
      },
      // transformed Lumen motif again, low and menacing, drifting against the ostinato.
      motif: {
        voice: 'bell', step: '4n', gain: 0.44,
        pattern: 'G3 . A3 . C4 . Eb4 . D4 .',
      },
    },
  },

  // ------------------------------------------------------------- Victory
  victory: {
    name: 'Bonds Rekindled', key: 'G', mode: 'major, fanfare', tempo: 112, swing: 0,
    meter: [4, 4], wet: 0.3,
    parts: {
      pad: {
        voice: 'warmPad', step: '2n', gain: 0.36,
        pattern: 'G3+B3+D4*2 C3+E3+G3*2 D3+F#3+A3*2 G3+B3+D4*4',
      },
      pluck: {
        voice: 'pluck', step: '8n', gain: 0.48,
        pattern: 'G4 B4 D5 G5 .*4 C4 E4 G4 C5 .*4 D4 F#4 A4 D5 .*4 G4 B4 D5 G5 .*4',
      },
      fanfare: {
        voice: 'bell', step: '8n', gain: 0.85,
        pattern: 'G4 A4 C5*2 E5*2 D5*2 G5*4 . . B5 A5 G5*3 . . E5 D5 C5*2 B4 A4 G4*4',
      },
    },
  },

  // ----------------------------------------------------------- Awakening
  awakening: {
    name: 'Awakening', key: 'G', mode: 'major, cinematic swell', tempo: 90, swing: 0,
    meter: [4, 4], wet: 0.46,
    parts: {
      choir: {
        voice: 'choir', step: '2n', gain: 0.32,
        pattern: 'Bb3+D4+F4*2 C4+Eb4+G4*2 D4+F#4+A4*2 G3+B3+D4*4',
      },
      pad: {
        voice: 'warmPad', step: '2n', gain: 0.24,
        pattern: '.*2 G3+B3+D4*8',
      },
      reveal: {
        voice: 'bell', step: '4n', gain: 0.8,
        pattern: '.*8 G4 A4 C5 E5 D5 G5*4',
      },
    },
  },

  // ------------------------------------------------------------ Gameover
  gameover: {
    name: 'The World Dims', key: 'A', mode: 'minor, tender', tempo: 58, swing: 0,
    meter: [4, 4], wet: 0.4,
    parts: {
      pad: {
        voice: 'warmPad', step: '2n', gain: 0.3,
        pattern: 'A3+C4+E4*2 F3+A3+C4*2 C3+E3+G3*2 E3+G3+B3*3',
      },
      flute: {
        voice: 'flute', step: '4n', gain: 0.5,
        pattern: '.*2 E5 D5 C5 B4 A4 G4 F4 E4*3',
      },
    },
  },
};
