define(['utils'], function (utils) {
    "use strict";

    function UefTape(stream) {
        var self = this;

        var dummyData, state, count, curByte, numDataBits, parity;
        var numParityBits, numStopBits, carrierBefore, carrierAfter;

        var baseFrequency = 1200;
        var baudMultiplier = 1;
        var shortWave = 0;
        var wavebits=[];
        const bit0pattern = [0,0,1,1,0,0,1,1,0,0,1,1,0,0,1,1];
        const bit1pattern = [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1];
        // FOR 0:  a 0 needs sending for 2*208us then 1 for 2*208ms - 4 times
        // FOR 1:  a 0 needs sending for 208ms then 1 for 208us - 8 times

        self.rewind = function () {

            dummyData = [false, false, true, false, true, false, true, false, true, true];
            state = -1;
            count = 0;
            curByte = 0;
            numDataBits = 8;
            parity = 'N';
            numParityBits = 0;
            numStopBits = 1;
            carrierBefore = 0;
            carrierAfter = 0;

            stream.seek(10);
            var minor = stream.readByte();
            var major = stream.readByte();
            if (major !== 0x00) throw "Unsupported UEF version " + major + "." + minor;
        };

        self.rewind();

        function readChunk() {
            var chunkId = stream.readInt16();
            var length = stream.readInt32();
            return {
                id: chunkId,
                stream: stream.substream(length)
            };
        }

        var curChunk = readChunk();

        function secsToClocks(secs) {
            return (self.cpuSpeed * secs) | 0;
        }

        function cycles(count) {
            // 1 cycle is 1/1200*4 (at 300baud)
            //

            //  bit change every 0.033ms (33ns or 33 clocks)
            // 33 /1000000 = 0.000033secs
            //

            // a cycle is a full sine wave from 0 to 360
            // 1 cycle at 1200 is 0.0008333 seconds
            // if this is a 2000000 (2mhz) clock then this will take
            //  1666.667 cycles

            // 1 cycle at 300 is 0.0333333 seconds
            // if this is a 1000000 (1mhz) clock then this will take
            //  3333.333 clock cycles

            return secsToClocks(count / baseFrequency * baudMultiplier);

            // should this be count / baseFrequency * baudMultiplier / 16 // for 16 little parts of the wave
        }

        /*

3340

        PPIA is read by CPU every 33 cycles (i.e us = microseconds)
        a high tone is detected by counting either <8 or >=8 changes
        need to have <8 for a high tone to have been detected
        need to have >=8 for a low tone to have been detected

        a '0' is 8 cycles of 2.4khz  (8/2400 = 3.3ms) - i.e up and down 8 times in 3.3ms
        a '1' is 4 cycles of 1.2khz  (4/1200 = 3.3ms) - i.e up and down 4 times in 3.3 ms
         */

        self.lasttime = 0;


        function parityOf(curByte) {
            var parity = false;
            while (curByte) {
                parity = !parity;
                curByte >>>= 1;
            }
            return parity;
        }

        self.poll = function (acia) {
            if (!curChunk) return;

            var isAtom = (acia.processor === undefined) ? false : acia.processor.model.isAtom;
            self.cpuSpeed = isAtom ? 1 * 1000 * 1000 : 2 * 1000 * 1000;

            if (isAtom) {
                if (wavebits.length > 0) {
                    // console.log("SEND (0x"+self.lastChunkId.toString(16)+") at ["+wavebits+"]" + self.processor.cycleSeconds + "seconds, " + self.processor.currentCycles + "cycles ("+t+") } ");
                    const wbit = wavebits.shift();
                    acia.receiveBit(wbit);
                    return cycles(1.0 / 15.5136);  // to create 3340 cycles between bits
                } else {
                    // console.log("NEXT (0x"+self.lastChunkId.toString(16)+") at " + self.processor.cycleSeconds + "seconds, " + self.processor.currentCycles + "cycles ("+t+") } ");
                }
            }


            if (state === -1) {
                if (stream.eof()) {
                    curChunk = null;
                    return;
                }
                curChunk = readChunk();
            }

            var gap;
            switch (curChunk.id) {
                case 0x0000:
                    console.log("Origin: " + curChunk.stream.readNulString());
                    break;
                case 0x0100:
                    acia.setTapeCarrier(false);
                    if (state === -1) {
                        console.log("0x100: implicit start/stop bit tape data block ");
                        state = 0;
                        curByte = curChunk.stream.readByte();
                        acia.tone(baseFrequency); // Start bit
                        // console.log("start "+"0".padStart(8, '0') );
                    } else if (state < 9) {
                        if (state === 0) {
                            // Start bit
                            acia.tone(baseFrequency);
                            // console.log("start "+"0".padStart(8, '0') );
                            if (isAtom) wavebits = Array.from(bit0pattern);
                        } else {
                            var bit = (curByte & (1 << (state - 1)));
                            acia.tone(bit ? (2 * baseFrequency) : baseFrequency);
                            // console.log("data "+bit.toString(2).padStart(8, '0') );
                            if (isAtom) wavebits = Array.from(bit?bit1pattern:bit0pattern);
                        }
                        state++;
                    } else {
                        acia.receive(curByte);
                        acia.tone(2 * baseFrequency); // Stop bit
                        // console.log("stop "+"1".padStart(8, '0') );
                        if (curChunk.stream.eof()) {
                            state = -1;
                        } else {
                            state = 0;
                            curByte = curChunk.stream.readByte();
                        }
                        if (isAtom) wavebits = Array.from(bit1pattern);
                    }
                    return isAtom?0:cycles(1);
                case 0x0104: // Defined data
                    acia.setTapeCarrier(false);
                    if (state === -1) {
                        numDataBits = curChunk.stream.readByte();
                        parity = curChunk.stream.readByte();
                        numStopBits = curChunk.stream.readByte() & 0xff;
                        numParityBits = parity !== 0x4E ? 1 : 0; // 'N' value in condition
                        if (isAtom && numStopBits & 0x80) // negative
                        {
                            numStopBits = Math.abs(numStopBits-256);
                            shortWave = 1;
                        }
                        console.log("Defined data with " + numDataBits + String.fromCharCode(parity) + (shortWave?'-':'') + numStopBits);
                        state = 0;
                    }
                    if (state === 0) {
                        if (curChunk.stream.eof()) {
                            state = -1;
                        } else {
                            curByte = curChunk.stream.readByte() & ((1 << numDataBits) - 1);
                            // console.log("Sending 0x"+curByte.toString(16)+" = "+String.fromCharCode(curByte));
                            acia.tone(baseFrequency); // Start bit
                            // console.log("start "+"0".padStart(8, '0') );
                            state++;
                            if (isAtom) wavebits = Array.from(bit0pattern);
                        }
                    } else if (state < (1 + numDataBits)) {
                        var bit = (curByte & (1 << (state - 1)));
                        acia.tone(bit ? (2 * baseFrequency) : baseFrequency);
                        // console.log("data "+bit.toString(2).padStart(8, '0') );
                        state++;
                        if (isAtom) wavebits = Array.from(bit?bit1pattern:bit0pattern);
                    } else if (state < (1 + numDataBits + numParityBits)) {
                        var bit = parityOf(curByte);
                        if (parity === 0x4E) bit = !bit;
                        acia.tone(bit ? (2 * baseFrequency) : baseFrequency);
                        // console.log("parity "+bit.toString(2).padStart(8, '0') );
                        state++;
                        if (isAtom) wavebits = Array.from(bit?bit1pattern:bit0pattern);
                    } else if (state < (1 + numDataBits + numParityBits + numStopBits)) {
                        acia.tone(2 * baseFrequency); // Stop bits
                        // console.log("stop "+"1".padStart(8, '0') );
                        state++;
                        if (isAtom) wavebits = Array.from(bit1pattern);
                    } else if (state < (1 + numDataBits + numParityBits + numStopBits + shortWave)) {
                        acia.tone(2 * baseFrequency); // Extra short wave - one cycle bits
                        // console.log("short "+"1".padStart(8, '0') );
                        state++;
                        if (isAtom) wavebits = Array.from(bit1pattern);
                    } else {
                        acia.receive(curByte);
                        state = 0;
                        return 0;
                    }
                    return isAtom?0:cycles(1);
                case 0x0111: // Carrier tone with dummy data
                    if (state === -1) {
                        state = 0;
                        carrierBefore = curChunk.stream.readInt16();
                        carrierAfter = curChunk.stream.readInt16();
                        console.log("Carrier with", carrierBefore, carrierAfter);
                    }
                    if (state === 0) {
                        acia.setTapeCarrier(true);
                        acia.tone(2 * baseFrequency);
                        carrierBefore--;
                        if (carrierBefore <= 0) state = 1;
                    } else if (state < 11) {
                        acia.setTapeCarrier(false);
                        acia.tone(dummyData[(state - 1)] ? baseFrequency : (2 * baseFrequency));
                        if (state === 10) {
                            acia.receive(0xaa);
                        }
                        state++;
                    } else {
                        acia.setTapeCarrier(true);
                        acia.tone(2 * baseFrequency);
                        carrierAfter--;
                        if (carrierAfter <= 0) state = -1;
                    }
                    return cycles(1);
                case 0x0114:
                    console.log("Ignoring security cycles");
                    break;
                case 0x0115:
                    console.log("Ignoring polarity change");
                    break;
                case 0x0110: // Carrier tone.
                    if (state === -1) {
                        state = 0;
                        count = curChunk.stream.readInt16();
                        if (isAtom) count /= 16;
                        console.log("Carrier tone for ", count);
                    }
                    acia.setTapeCarrier(true);
                    acia.tone(2 * baseFrequency);
                    count--;
                    if (count <= 0) state = -1;
                    if (isAtom) wavebits = Array.from(bit1pattern);
                    return isAtom?0:cycles(1);
                case 0x0113:
                    baseFrequency = curChunk.stream.readFloat32();
                    console.log("Frequency change ", baseFrequency);
                    break;
                case 0x0112:
                    acia.setTapeCarrier(false);
                    gap = 1 / (2 * curChunk.stream.readInt16() * baseFrequency);
                    console.log("Tape gap of " + gap + "s");
                    acia.tone(0);
                    if (isAtom) wavebits = Array.from(bit0pattern);
                    return secsToClocks(gap);
                case 0x0116:
                    acia.setTapeCarrier(false);
                    gap = curChunk.stream.readFloat32();
                    console.log("Tape gap of " + gap + "s");
                    acia.tone(0);
                    if (isAtom) wavebits = Array.from(bit0pattern);
                    return secsToClocks(gap);
                case 0x0117:
                    var baud = curChunk.stream.readInt16();
                    if (baud == 300)
                        baudMultiplier = 4;
                    console.log("Baud rate of " + baud);
                    break;
                default:
                    console.log("Skipping unknown chunk " + utils.hexword(curChunk.id));
                    curChunk = readChunk();
                    break;
            }
            return cycles(1);
        };
    }


    function TapefileTape(stream) {
        var self = this;

        self.count = 0;
        self.stream = stream;

        var dividerTable = [1, 16, 64, -1];

        function rate(acia) {
            var bitsPerByte = 9;
            if (!(acia.cr & 0x80)) {
                bitsPerByte++; // Not totally correct if the AUG is to be believed.
            }
            var divider = dividerTable[acia.cr & 0x03];
            // http://beebwiki.mdfs.net/index.php/Serial_ULA says the serial rate is ignored
            // for cassette mode.
            var cpp = (2 * 1000 * 1000) / (19200 / divider);
            return Math.floor(bitsPerByte * cpp);
        }

        self.rewind = function () {
            stream.seek(10);
        };

        self.poll = function (acia) {
            if (stream.eof()) return 100000;
            var byte = stream.readByte();
            if (byte === 0xff) {
                byte = stream.readByte();
                if (byte === 0) {
                    acia.setTapeCarrier(false);
                    return 0;
                } else if (byte === 0x04) {
                    acia.setTapeCarrier(true);
                    // Simulate 5 seconds of carrier.
                    return 5 * 2 * 1000 * 1000;
                } else if (byte !== 0xff) {
                    throw "Got a weird byte in the tape";
                }
            }
            acia.receive(byte);
            return rate(acia);
        };
    }

    function loadTapeFromData(name, data) {
        var stream = new utils.DataStream(name, data);
        if (stream.readByte(0) === 0xff && stream.readByte(1) === 0x04) {
            console.log("Detected a 'tapefile' tape");
            return new TapefileTape(stream);
        }
        if (stream.readNulString(0) === "UEF File!") {
            console.log("Detected a UEF tape");
            return new UefTape(stream);
        }
        console.log("Unknown tape format");
        return null;
    }

    function loadTape(name) {
        console.log("Loading tape from " + name);
        return utils.loadData(name).then(function (data) {
            return loadTapeFromData(name, data);
        });
    }

    return {
        loadTape: loadTape,
        loadTapeFromData: loadTapeFromData
    };
});
