const MidiWriter = require('midi-writer-js');

const TRACK_COUNT = 4;
const BASE_SONG_OFFSET = 0xB961;
const BASE_INSTRUMENT_OFFSET = 0xBA6B;
const BASE_VOLUME_OFFSET = 0xBA61;
const BASE_PAN_OFFSET = 0xBA66;
const BASE_DRUM_OFFSET = 0xB9E1;
const SIMULTANEOUS_DRUMS = 4;
const VOLUME_MULTIPLIER = 20;
const PAN_MULTIPLIER = 32;

const notes = {
	[0]: 'G',
	[1]: 'G#',
	[2]: 'A',
	[3]: 'A#',
	[4]: 'B',
	[5]: 'C',
	[6]: 'C#',
	[7]: 'D',
	[8]: 'D#',
	[9]: 'E',
	[10]: 'F',
	[11]: 'F#',
	[12]: 'G',
	[13]: 'G#',
	[14]: 'A',
	[15]: 'A#',
	[16]: 'B',
	[17]: 'C',
	[18]: 'C#',
	[19]: 'D',
	[20]: 'D#',
	[21]: 'E',
	[22]: 'F',
	[23]: 'F#',
	[24]: 'G'
};

const instrumentCodes = [
	// Group 1: Piano and Flutes
	0, 18, 6, 22,
	73, 56, 65, 75,
	// Group 2: Guitars and others
	24, 29, 106, 33,
	40, 13, 11, 47,
	// Group 3: SF: Future and Mystery
	72, 78, 17, 38,
	77, 59, 126, 124,
	// Group 4: Creatures/Animals
	60, 61, 62, 123,
	66, 125, 68, 122,
	// Group 5: Voice
	53, 54, 52, 49,
	67, 121, 119, 48,
	// Group 6: 8-bit
	83, 84, 85, 86,
	87, 88, 89, 90
];

const instrumentLengths = [
	// Group 1: Piano and Flutes
	32, 32, 16, 24,
	32, 3, 16, 32,
	// Group 2: Guitars and others
	16, 48, 16, 4,
	32, 32, 32, 3,
	// Group 3: SF: Future and Mystery
	64, 64, 32, 3,
	32, 32, 16, 4,
	// Group 4: Creatures/Animals
	16, 16, 16, 16,
	16, 12, 16, 32,
	// Group 5: Voice
	32, 24, 24, 32,
	24, 32, 32, 48,
	// Group 6: 8-bit
	32, 32, 64, 32,
	32, 32, 32, 32
];

const basePitches = [
	// Group 1: Piano and Flutes
	3, 3, 3, 3,
	4, 3, 3, 3,
	// Group 2: Guitars and others
	3, 2, 2, 1,
	4, 4, 4, 2,
	// Group 3: SF: Future and Mystery
	4, 4, 4, 1,
	3, 3, 3, 3,
	// Group 4: Creatures/Animals
	3, 3, 3, 2,
	3, 3, 3, 2,
	// Group 5: Voice
	3, 1, 2, 3,
	3, 3, 3, 2,
	// Group 6: 8-bit
	3, 3, 3, 3,
	3, 3, 3, 3,
];

const drumCodes = [
	0, 25, 1, 56,
	48, 20, 24, 16
]

const buildMidiFile = (mioData, loopTimes = 0) => {
	let tracks = [];

	let trackLength = 32;

	for (let trackIndex = 0; trackIndex < TRACK_COUNT; trackIndex++) {
		let track = new MidiWriter.Track();

		let songOffset = BASE_SONG_OFFSET + trackIndex * trackLength;

		let instrumentUsed = mioData[BASE_INSTRUMENT_OFFSET + trackIndex];
		let volume = mioData[BASE_VOLUME_OFFSET + trackIndex] * VOLUME_MULTIPLIER;
		let pan = Math.min(127, mioData[BASE_PAN_OFFSET + trackIndex] * PAN_MULTIPLIER);

		let notesUsed = []

		let base = basePitches[instrumentUsed];

		for (let i = 0; i < 25; i++) {
			if (i <= 4) {
				notesUsed.push(notes[i] + base);
			} else if (i <= 16) {
				notesUsed.push(notes[i] + (base + 1));
			} else {
				notesUsed.push(notes[i] + (base + 2));
			}
		}

		let channel = trackIndex + 1;

		let hasEndNote = false;
		const finalTick = (1 + loopTimes) * 1024;

		track.addEvent(new MidiWriter.ProgramChangeEvent({ channel, instrument: parseInt(instrumentCodes[instrumentUsed]) }));
		track.addEvent(new MidiWriter.ControllerChangeEvent({ channel, controllerNumber: 10, controllerValue: pan }));
		for (let loopIter = 0; loopIter <= loopTimes; loopIter++) {
			for (let i = 0; i < trackLength; i++) {
				let note = mioData[songOffset + i];
				if (note !== 255) {
					let noteLength = (instrumentLengths[instrumentUsed] * 8);
					let startTick = 32 * i + loopIter * 1024;
					for (var p = i + 1; ; p++) {
						if (mioData[songOffset + (p % trackLength)] !== 255) {
							//console.debug(i, p);
							break;
						}
					}
					let peek = p * 32;
					noteLength = Math.min(noteLength, peek - i * 32);
					let duration = 'T' + noteLength;
					track.addEvent(new MidiWriter.NoteEvent({
						pitch: notesUsed[note],
						duration,
						startTick,
						channel,
						velocity: volume
					}));
					if (hasEndNote === false) {
						track.addEvent(new MidiWriter.NoteEvent({
							pitch: notesUsed[note],
							duration: 'T1',
							startTick: finalTick - 1,
							channel,
							velocity: 0
						}));
						hasEndNote = true;
					}
				}
			}
		}

		tracks.push(track);
	}

	{

		let track = new MidiWriter.Track();

		let volume = mioData[BASE_VOLUME_OFFSET + 4] * VOLUME_MULTIPLIER;
		let pan = Math.min(127, mioData[BASE_PAN_OFFSET + 4] * PAN_MULTIPLIER);

		let drumSet = mioData[0xBA6F] & 0x7;

		let drumConversion;
		if (drumSet === 0) drumConversion = [35, 38, 42, 46, 49, 45, 50, 47, 37, 39, 82, 29, 80, 81];
		if (drumSet === 1) drumConversion = [35, 38, 44, 46, 49, 40, 41, 42, 39, 37, 50, 51, 81, 80];
		if (drumSet === 2) drumConversion = [66, 65, 82, 56, 57, 61, 60, 62, 75, 58, 79, 78, 83, 72];
		if (drumSet === 3) drumConversion = [36, 37, 38, 50, 40, 60, 61, 62, 44, 39, 46, 47, 49, 51];
		if (drumSet === 4) drumConversion = [36, 37, 82, 81, 38, 40, 42, 47, 39, 34, 41, 43, 44, 80];
		if (drumSet === 5) drumConversion = [36, 38, 80, 81, 39, 35, 40, 41, 42, 58, 44, 45, 49, 43];
		if (drumSet === 6) drumConversion = [35, 38, 42, 46, 49, 40, 44, 39, 37, 51, 52, 53, 54, 55];
		if (drumSet === 7) drumConversion = [35, 38, 42, 46, 49, 41, 45, 50, 36, 39, 43, 34, 47, 48];

		track.addEvent(new MidiWriter.ProgramChangeEvent({ channel: 10, instrument: drumCodes[drumSet] }));
		track.addEvent(new MidiWriter.ControllerChangeEvent({ channel: 10, controllerNumber: 10, controllerValue: pan }));

		for (let loopIter = 0; loopIter <= loopTimes; loopIter++) {
			for (let i = 0; i < trackLength; i++) {
				for (let drumIndex = 0; drumIndex < SIMULTANEOUS_DRUMS; drumIndex++) {
					let drumUsed = mioData[BASE_DRUM_OFFSET + i + drumIndex * 32];
					if (drumUsed !== 255) {
						let duration = 'T128';
						track.addEvent([
							new MidiWriter.NoteEvent({
								pitch: drumConversion[drumUsed],
								duration,
								channel: 10,
								startTick: 32 * i + loopIter * 1024,
								velocity: volume
							}),
						]);
					}
				}
			}
		}

		tracks.push(track);
	}

	let write = new MidiWriter.Writer(tracks);

	return write.buildFile()
}


window.buildMidiRecordFile = (mioData) => {

	const END_INDEX = 0x102;
	const BASE_INSTRUMENT_OFFSET = 0x211;
	const SEGMENT_LENGTH = 0x114;
	const SEGMENT_OFFSET = (n) => n * SEGMENT_LENGTH;
	const BASE_SONG_OFFSET = 0x107;
	const BASE_VOLUME_OFFSET = 0x207;
	const BASE_PAN_OFFSET = 0x20C;
	const BASE_DRUM_OFFSET = 0x187;
	const BASE_DRUMSET_OFFSET = 0x211;
	const TEMPO_OFFSET = 0x101;
	const SWING_OFFSET = 0x100;
	const swingJump = 11;

	let tracks = [];

	let trackLength = 32;

	let tempo = mioData[TEMPO_OFFSET] * 10 + 60;
	let isSwing = mioData[SWING_OFFSET] != 0;
	console.log("Tempo:", tempo, "Swing:", isSwing);

	for (let trackIndex = 0; trackIndex < TRACK_COUNT; trackIndex++) {
		let track = new MidiWriter.Track();
		track.setTempo(tempo);
		let lastTick = 0;
		for (let segmentIndex = 0; segmentIndex < mioData[END_INDEX]; segmentIndex++) {

			let songOffset = BASE_SONG_OFFSET + SEGMENT_OFFSET(segmentIndex) + trackIndex * trackLength;

			let instrumentUsed = mioData[BASE_INSTRUMENT_OFFSET + SEGMENT_OFFSET(segmentIndex) + trackIndex];
			let volume = mioData[BASE_VOLUME_OFFSET + SEGMENT_OFFSET(segmentIndex) + trackIndex] * VOLUME_MULTIPLIER;
			let pan = Math.min(127, mioData[BASE_PAN_OFFSET + SEGMENT_OFFSET(segmentIndex) + trackIndex] * PAN_MULTIPLIER);

			let notesUsed = []

			let base = basePitches[instrumentUsed];

			for (let i = 0; i < 25; i++) {
				if (i <= 4) {
					notesUsed.push(notes[i] + base);
				} else if (i <= 16) {
					notesUsed.push(notes[i] + (base + 1));
				} else {
					notesUsed.push(notes[i] + (base + 2));
				}
			}

			let channel = trackIndex + 1;

			track.addEvent(new MidiWriter.ProgramChangeEvent({ channel, instrument: parseInt(instrumentCodes[instrumentUsed])}));
			track.addEvent(new MidiWriter.ControllerChangeEvent({ channel, controllerNumber: 10, controllerValue: pan }));
			for (let i = 0; i < trackLength; i++) {
				let note = mioData[songOffset + i];
				if (note !== 255) {
					wasNoteFound = true;
					let noteLength = (instrumentLengths[instrumentUsed] * 8);
					let si = segmentIndex;
					for (var p = i + 1; ; p++) {
						if (p % trackLength == 0) {
							si += 1;
							if (si >= mioData[END_INDEX]) {
								p = 0;
								break;
							}
						}
						let otherOffset = BASE_SONG_OFFSET + SEGMENT_OFFSET(si) + trackIndex * trackLength;
						if (otherOffset + (p % trackLength) <= songOffset + i) {
							p = 0;
							break;
						}
						if (mioData[otherOffset + (p % trackLength)] !== 255) {
							break;
						}
					}
					let swingOffset = isSwing && i % 2 == 1 ? swingJump : 0;
					if (p != 0) {
						let peek = p * 32;
						let startPos = i * 32 + swingOffset;
						if (noteLength > peek - startPos) {
							noteLength = peek - startPos;
						}
						noteLength = Math.min(noteLength, peek - i * 32);
					}
					let startTick = 32 * i + segmentIndex * 1024;
					if (isSwing && i % 2 == 1) {
						startTick += swingOffset;
					}
					// console.debug(i, startTick, lastTick, startTick - lastTick)
					let duration = 'T' + noteLength;
					track.addEvent(new MidiWriter.NoteEvent({
						pitch: notesUsed[note],
						duration,
						wait: 'T' + (startTick - lastTick),
						channel,
						velocity: volume
					}));

					lastTick = startTick;
					let lastLength = noteLength;
					lastTick += lastLength;
				}
			}

		}
		
		tracks.push(track);
	}

	let track = new MidiWriter.Track();

	track.setTempo(tempo);

	for (let segmentIndex = 0; segmentIndex < mioData[END_INDEX]; segmentIndex++) {
		let volume = mioData[BASE_VOLUME_OFFSET + SEGMENT_OFFSET(segmentIndex) + 4] * VOLUME_MULTIPLIER;
		let pan = Math.min(127, mioData[BASE_PAN_OFFSET + SEGMENT_OFFSET(segmentIndex) + 4] * PAN_MULTIPLIER);

		let drumSet = mioData[BASE_DRUMSET_OFFSET + SEGMENT_OFFSET(segmentIndex) + 4] & 0x7;

		let drumConversion;
		if (drumSet === 0) drumConversion = [35, 38, 42, 46, 49, 45, 50, 47, 37, 39, 82, 29, 80, 81];
		if (drumSet === 1) drumConversion = [35, 38, 44, 46, 49, 40, 41, 42, 39, 37, 50, 51, 81, 80];
		if (drumSet === 2) drumConversion = [66, 65, 82, 56, 57, 61, 60, 62, 75, 58, 79, 78, 83, 72];
		if (drumSet === 3) drumConversion = [36, 37, 38, 50, 40, 60, 61, 62, 44, 39, 46, 47, 49, 51];
		if (drumSet === 4) drumConversion = [36, 37, 82, 81, 38, 40, 42, 47, 39, 34, 41, 43, 44, 80];
		if (drumSet === 5) drumConversion = [36, 38, 80, 81, 39, 35, 40, 41, 42, 58, 44, 45, 49, 43];
		if (drumSet === 6) drumConversion = [35, 38, 42, 46, 49, 40, 44, 39, 37, 51, 52, 53, 54, 55];
		if (drumSet === 7) drumConversion = [35, 38, 42, 46, 49, 41, 45, 50, 36, 39, 43, 34, 47, 48];

		track.addEvent(new MidiWriter.ProgramChangeEvent({ channel: 10, instrument: drumCodes[drumSet] }));
		track.addEvent(new MidiWriter.ControllerChangeEvent({ channel: 10, controllerNumber: 10, controllerValue: pan }));

		for (let i = 0; i < trackLength; i++) {
			for (let drumIndex = 0; drumIndex < SIMULTANEOUS_DRUMS; drumIndex++) {
				let drumUsed = mioData[BASE_DRUM_OFFSET + SEGMENT_OFFSET(segmentIndex) + i + drumIndex * 32];
				if (drumUsed !== 255) {
					let duration = 'T32';
					let swingOffset = isSwing && i % 2 == 1 ? swingJump : 0;
					track.addEvent([
						new MidiWriter.NoteEvent({
							pitch: drumConversion[drumUsed],
							duration,
							channel: 10,
							startTick: 32 * i + segmentIndex * 1024 + swingOffset,
							velocity: volume
						}),
					]);
				}
			}
		}

		let interim_write = new MidiWriter.Writer([track]);
		interim_write.buildFile();
		track = interim_write.tracks[0];
	}

	let lastOne = 0;
	for (let z = 0; z < track.events.length; z++) {

		if (Number.isNaN(track.events[z].delta)) {
			track.events[z].delta = track.events[z].tick - lastOne;
		}
		if (track.events[z].tick) {
			lastOne = track.events[z].tick;
		}

	}

	tracks.push(track);

	let write = new MidiWriter.Writer(tracks);

	return write.buildFile()
}

module.exports = { buildMidiFile, buildMidiRecordFile };