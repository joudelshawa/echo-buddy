/**
 * Standard pitch, pitchSemitones, and playbackRate AudioParam descriptors
 * shared by all SoundTouchJS worklet processors.
 */
export const STANDARD_PARAMETER_DESCRIPTORS = [
    {
        name: 'pitch',
        defaultValue: 1.0,
        minValue: 0.1,
        maxValue: 8.0,
        automationRate: 'k-rate',
    },
    {
        name: 'pitchSemitones',
        defaultValue: 0,
        minValue: -24,
        maxValue: 24,
        automationRate: 'k-rate',
    },
    {
        name: 'playbackRate',
        defaultValue: 1.0,
        minValue: 0.1,
        maxValue: 8.0,
        automationRate: 'k-rate',
    },
];
//# sourceMappingURL=types.js.map