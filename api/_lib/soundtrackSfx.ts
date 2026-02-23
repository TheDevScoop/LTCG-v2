const SAMPLE_RATE = 22050;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const DEFAULT_FREQUENCY_HZ = 220;

export const TRACK_FREQUENCY_HZ: Record<string, number> = {
	summon: 440,
	spell: 520,
	attack: 620,
	turn: 740,
	victory: 880,
	defeat: 260,
	draw: 330,
	error: 180,
};

export function resolveTrackFrequency(trackName: unknown): number {
	if (typeof trackName !== "string") return DEFAULT_FREQUENCY_HZ;
	const key = trackName.trim().toLowerCase();
	return TRACK_FREQUENCY_HZ[key] ?? DEFAULT_FREQUENCY_HZ;
}

export function buildToneBuffer(frequency: number): Buffer {
	const sampleCount = Math.max(Math.floor(SAMPLE_RATE * 0.125), 128);
	const dataLength = sampleCount * CHANNELS * BYTES_PER_SAMPLE;
	const buffer = Buffer.alloc(44 + dataLength, 0);
	const bytesPerSecond = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;
	const blockAlign = CHANNELS * BYTES_PER_SAMPLE;
	const amplitude = 0.08 * 32767;

	const writeString = (offset: number, value: string) => {
		buffer.write(value, offset);
	};

	const writeUInt32LE = (offset: number, value: number) => {
		buffer.writeUInt32LE(value, offset);
	};

	const writeUInt16LE = (offset: number, value: number) => {
		buffer.writeUInt16LE(value, offset);
	};

	writeString(0, "RIFF");
	writeUInt32LE(4, dataLength + 36);
	writeString(8, "WAVE");
	writeString(12, "fmt ");
	writeUInt32LE(16, 16);
	writeUInt16LE(20, 1);
	writeUInt16LE(22, CHANNELS);
	writeUInt32LE(24, SAMPLE_RATE);
	writeUInt32LE(28, bytesPerSecond);
	writeUInt16LE(32, blockAlign);
	writeUInt16LE(34, BITS_PER_SAMPLE);
	writeString(36, "data");
	writeUInt32LE(40, dataLength);

	for (let i = 0; i < sampleCount; i += 1) {
		const t = i / SAMPLE_RATE;
		const sample = Math.round(
			Math.sin(2 * Math.PI * frequency * t) * amplitude,
		);
		buffer.writeInt16LE(sample, 44 + i * BYTES_PER_SAMPLE);
	}

	return buffer;
}
