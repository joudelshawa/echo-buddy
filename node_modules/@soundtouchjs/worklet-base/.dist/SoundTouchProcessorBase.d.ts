import { SoundTouch } from '@soundtouchjs/core';
import type { RateTransposerInterpolationStrategy, SoundTouchOptions } from '@soundtouchjs/core';
import type { ProcessCoreResult } from './types.js';
/**
 * Abstract base class for all SoundTouchJS AudioWorklet processor implementations.
 *
 * @remarks
 * Centralises shared state (pipe, sample buffers, runtime-update queue), the
 * `applyPendingRuntimeUpdates` helper, and the core DSP pipeline in
 * `processCore`. Subclasses must implement `process` and `onProcessComplete`.
 *
 * The default `process` implementation calls `applyPendingRuntimeUpdates`,
 * `processCore`, and then `onProcessComplete`. Subclasses that need to
 * interleave additional logic (e.g. LPC analysis) can override `beforePipeProcess`
 * and/or `extractSamples` instead of overriding `process` entirely.
 */
export declare abstract class SoundTouchProcessorBase extends AudioWorkletProcessor {
    /** The SoundTouch DSP pipeline instance. */
    protected _pipe: SoundTouch;
    /** Interleaved (L, R, L, R, …) input staging buffer. */
    protected _samples: Float32Array;
    /** Interleaved output staging buffer populated by `extractSamples`. */
    protected _outputSamples: Float32Array;
    /** Cumulative count of render blocks where the output buffer ran short. */
    protected _underrunCount: number;
    /** Total render blocks processed since construction. */
    protected _blockCount: number;
    private _pendingInterpolationStrategy;
    private _pendingInterpolationStrategyParams;
    private _pendingStretchParameters;
    /** Label used in console messages (e.g. `'[SoundTouchProcessor]'`). */
    protected readonly processorLabel: string;
    /**
     * Validates and resolves an interpolation strategy id, falling back to
     * `'lanczos'` if the id is unrecognised.
     *
     * @remarks
     * Call this as a static expression inside the `super()` argument list of a
     * subclass constructor so that strategy resolution happens before pipe creation.
     *
     * @param strategy - The strategy id provided by the caller.
     * @param processorLabel - Label included in the fallback console message.
     * @returns The original `strategy` if valid, or `'lanczos'` as a fallback.
     */
    static resolveStrategy(strategy: RateTransposerInterpolationStrategy | undefined, processorLabel: string): RateTransposerInterpolationStrategy | undefined;
    /**
     * @param processorLabel - Label string used in diagnostic messages.
     * @param pipeOptions - Options forwarded to the `SoundTouch` constructor. The
     *   `sampleRate` global must be available in the AudioWorklet scope.
     */
    constructor(processorLabel: string, pipeOptions: SoundTouchOptions);
    /**
     * Flushes any pending interpolation-strategy or stretch-parameter change
     * that arrived via `port.onmessage` since the last render block.
     *
     * @remarks
     * Call this at the top of `process` before touching `_pipe`.
     */
    protected applyPendingRuntimeUpdates(): void;
    /**
     * Optional hook called after input routing and buffer resize but **before**
     * the SoundTouch pipe processes the block.
     *
     * @remarks
     * Override in subclasses that need to inspect or transform the raw input
     * before it enters the DSP pipeline (e.g. computing LPC coefficients).
     *
     * @param _leftInput - Left-channel input for this render block.
     * @param _rightInput - Right-channel input (same as left for mono sources).
     * @param _frameCount - Number of frames in this block.
     * @param _parameters - AudioParam k-rate values for this render block.
     */
    protected beforePipeProcess(_leftInput: Float32Array, _rightInput: Float32Array, _frameCount: number, _parameters: Record<string, Float32Array>): void;
    /**
     * Extracts rendered frames from the output buffer, writes them to
     * `leftOutput`/`rightOutput`, zero-fills any gap, and returns RMS/peak metrics.
     *
     * @remarks
     * Override in subclasses that apply post-extraction transforms (e.g. formant
     * correction). Overrides are responsible for the full extraction, write-back,
     * silence fill, and returning `{ outputRms, outputPeak }`.
     *
     * @param leftOutput - Destination view for the left channel.
     * @param rightOutput - Destination view for the right channel.
     * @param frameCount - Total frames expected in this block.
     * @param toExtract - Frames available to extract (≤ frameCount).
     * @param _parameters - AudioParam k-rate values (available for overrides).
     * @returns RMS and peak of the extracted block.
     */
    protected extractSamples(leftOutput: Float32Array, rightOutput: Float32Array, frameCount: number, toExtract: number, _parameters: Record<string, Float32Array>): {
        outputRms: number;
        outputPeak: number;
    };
    /**
     * Runs the full DSP pipeline for one render block and returns metrics.
     *
     * @remarks
     * Handles input routing, buffer resize, `beforePipeProcess`, pitch
     * calculation, sample interleaving, pipe feed/process, counter updates,
     * and `extractSamples`. Returns `null` when the input is empty or
     * the output has not been allocated, keeping the processor alive.
     *
     * @param inputs - AudioWorklet input buses.
     * @param outputs - AudioWorklet output buses.
     * @param parameters - k-rate AudioParam values.
     * @returns Render-block result, or `null` if inputs are not ready.
     */
    protected processCore(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): ProcessCoreResult | null;
    /**
     * Called after a successful `processCore` invocation with the render-block result.
     *
     * @remarks
     * Implement this to post processor-specific metrics to the main thread.
     * The default `process` implementation calls this after `processCore`.
     *
     * @param result - Data from the completed render block.
     */
    protected abstract onProcessComplete(result: ProcessCoreResult): void;
    /**
     * AudioWorkletProcessor render callback. Keeps the processor alive by always returning `true`.
     *
     * @remarks
     * The default implementation calls `applyPendingRuntimeUpdates`, `processCore`,
     * and `onProcessComplete`. Override only when the execution order must differ
     * (e.g. pre-pipe analysis steps not covered by `beforePipeProcess`).
     *
     * @param inputs - AudioWorklet input buses.
     * @param outputs - AudioWorklet output buses.
     * @param parameters - k-rate AudioParam values.
     * @returns Always `true` to keep the processor alive.
     */
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
//# sourceMappingURL=SoundTouchProcessorBase.d.ts.map