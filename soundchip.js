define(['./utils'], function (utils) {
    "use strict";

    function SoundChip(sampleRate, cpuSpeed) {
//ATOM has 1Mhz processor , BBC has 2Mhz processer
        var cpuFreq = 1 / cpuSpeed;

        // 4MHz input signal. Internal divide-by-8
        var soundchipFreq = 4000000.0 / 8;
        // Square wave changes every time a counter hits zero. Thus a full wave
        // needs to be 2x counter zeros.
        var waveDecrementPerSecond = soundchipFreq / 2;
        // Each sample in the buffer represents (1/sampleRate) time, so each time
        // we generate a sample, we need to decrement the counters by this amount:
        var sampleDecrement = waveDecrementPerSecond / sampleRate;
        // How many samples are generated per CPU cycle.
        var samplesPerCycle = sampleRate * cpuFreq;
        var minCyclesWELow = 14; // Somewhat empirically derived; Repton 2 has only 14 cycles between WE low and WE high (@0x2caa)

        var register = [0, 0, 0, 0];
        this.registers = register; // for debug
        var counter = [0, 0, 0, 0];
        var outputBit = [false, false, false, false];
        var volume = [0, 0, 0, 0];
        this.volume = volume;  // for debug
        var generators = [null, null, null, null, null , null]; // added ATOM generator

        var volumeTable = [];
        var f = 1.0;
        var i;
        for (i = 0; i < 16; ++i) {
            volumeTable[i] = f / generators.length;  // Bakes in the per channel volume
            f *= Math.pow(10, -0.1);
        }
        volumeTable[15] = 0;

        var sineTableSize = 8192;
        var sineTable = [];
        for (i = 0; i < sineTableSize; ++i) {
            sineTable[i] = Math.sin(2 * Math.PI * i / sineTableSize) / generators.length;
        }
        var sineStep = 0;
        var sineOn = false;
        var sineTime = 0;

        function sineChannel(channel, out, offset, length) {
            if (!sineOn) {
                return;
            }
            for (var i = 0; i < length; ++i) {
                out[i + offset] += sineTable[sineTime & (sineTableSize - 1)];
                sineTime += sineStep;
            }
            while (sineTime > sineTableSize) sineTime -= sineTableSize;
        }

        this.toneGenerator = {
            mute: function () {
                catchUp();
                sineOn = false;
            },
            tone: function (freq) {
                catchUp();
                sineOn = true;
                sineStep = (freq / sampleRate) * sineTableSize;
            }
        };

        function toneChannel(channel, out, offset, length) {
            var i;
            var reg = register[channel], vol = volume[channel];
            if (reg === 0) reg = 1024;
            for (i = 0; i < length; ++i) {
                counter[channel] -= sampleDecrement;
                if (counter[channel] < 0) {
                    counter[channel] += reg;
                    outputBit[channel] = !outputBit[channel];
                }
                out[i + offset] += (outputBit[channel] * vol);
            }
        }

        var lfsr = 0;

        function shiftLfsrWhiteNoise() {
            var bit = (lfsr & 1) ^ ((lfsr & (1 << 1)) >>> 1);
            lfsr = (lfsr >>> 1) | (bit << 14);
        }

        function shiftLfsrPeriodicNoise() {
            lfsr >>= 1;
            if (lfsr === 0) lfsr = 1 << 14;
        }

        var shiftLfsr = shiftLfsrWhiteNoise;

        function noisePoked() {
            shiftLfsr = register[3] & 4 ? shiftLfsrWhiteNoise : shiftLfsrPeriodicNoise;
            lfsr = 1 << 14;
        }

        function addFor(channel) {
            channel = channel | 0;
            switch (register[channel] & 3) {
                case 0:
                    return 0x10;
                case 1:
                    return 0x20;
                case 2:
                    return 0x40;
                case 3:
                    return register[channel - 1];
            }
        }

        function noiseChannel(channel, out, offset, length) {
            var add = addFor(channel), vol = volume[channel];
            for (var i = 0; i < length; ++i) {
                counter[channel] -= sampleDecrement;
                if (counter[channel] < 0) {
                    counter[channel] += add;
                    outputBit[channel] = !outputBit[channel];
                    if (outputBit[channel]) shiftLfsr();
                }
                out[i + offset] += ((lfsr & 1) * vol);
            }
        }

        var enabled = true;

        function generate(out, offset, length) {
            offset = offset | 0;
            length = length | 0;
            var i;
            for (i = 0; i < length; ++i) {
                out[i + offset] = 0.0;
            }
            if (!enabled) return;
            for (i = 0; i < generators.length; ++i) {
                generators[i](i, out, offset, length);
            }
        }

        var scheduler = {epoch: 0};
        var lastRunEpoch = 0;

        function catchUp() {
            var cyclesPending = scheduler.epoch - lastRunEpoch;
            if (cyclesPending > 0) {
                advance(cyclesPending);
            }
            lastRunEpoch = scheduler.epoch;
        }

        var activeTask = null;
        this.setScheduler = function (scheduler_) {
            scheduler = scheduler_;
            lastRunEpoch = scheduler.epoch;
            activeTask = scheduler.newTask(function () {
                if (this.active) {
                    poke(this.slowDataBus);
                }
            }.bind(this));
        };

        var residual = 0;
        var position = 0;
        var maxBufferSize = 4096;
        var buffer;
        if (typeof Float64Array !== "undefined") {
            buffer = new Float64Array(maxBufferSize);
        } else {
            buffer = new Float32Array(maxBufferSize);
        }

        // this grabs data from the generators and makes the noise
        // polled by the browser!
        function render(out, offset, length) {
            catchUp();
            var fromBuffer = position > length ? length : position;
            for (var i = 0; i < fromBuffer; ++i) {
                out[offset + i] = buffer[i];
            }
            offset += fromBuffer;
            length -= fromBuffer;
            for (i = fromBuffer; i < position; ++i) {
                buffer[i - fromBuffer] = buffer[i];
            }
            position -= fromBuffer;
            if (length !== 0) {
                generate(out, offset, length);
            }
        }

        function advance(time) {
            var num = time * samplesPerCycle + residual;
            var rounded = num | 0;
            residual = num - rounded;
            if (position + rounded >= maxBufferSize) {
                rounded = maxBufferSize - position;
            }
            if (rounded === 0) return;
            generate(buffer, position, rounded);
            position += rounded;
        }

        var latchedRegister = 0;

        // triggered by the emulator to latch relevant data
        // on ATOM this is really just using the 'catchup' regularly.
        function poke(value) {
            catchUp();

            var command;
            var channel;
            if (value & 0x80) {
                latchedRegister = (value & 0x70);
                command = (value & 0xF0);
            } else {
                command = latchedRegister;
            }
            channel = ((command >> 5) & 0x03);

            if (command & 0x10) {
                // Volume setting
                var newVolume = value & 0x0f;
                volume[channel] = volumeTable[newVolume];
            } else if (channel === 3) {
                // For noise channel we always update the bottom bits.
                register[channel] = value & 0x0f;
                noisePoked();
            } else if (command & 0x80) {
                // Low period bits.
                register[channel] = (register[channel] & ~0x0f) | (value & 0x0f);
            } else {
                // High period bits.
                register[channel] = (register[channel] & 0x0f) | ((value & 0x3f) << 4);
            }
        }

        for (i = 0; i < 3; ++i) {
            generators[i] = toneChannel;
        }
        generators[3] = noiseChannel;
        generators[4] = sineChannel;

        this.render = render;
        this.active = false;
        this.slowDataBus = 0;
        this.updateSlowDataBus = function (slowDataBus, active) {
            this.slowDataBus = slowDataBus;
            this.active = active;
            // TODO: this probably isn't modeled correctly. Currently the
            // sound chip "notices" a new data bus value some fixed number of
            // cycles after WE (write enable) is triggered.
            // In reality, the sound chip likely pulls data off the bus at a
            // fixed point in its cycle, iff WE is active.
            if (active) {
                activeTask.ensureScheduled(true, minCyclesWELow);
            }
        };

        //ATOM
        generators[5] = speakerChannel;

        var speakerBufferSize = 8192;
        var speakerBuffer = [];
        for (i = 0; i < speakerBufferSize; ++i) {
            speakerBuffer[i] = 0.0;
        }

        var speakerTime = 0;
        var bufferPos = speakerBufferSize>>1;  // start buffer half way through buffer and speakertime at the beginning
        // var samplesSinceLastValueChange = 0;

        var lastSecond = 0;
        var lastMicroCycle = 0;
        var outstandingCycles = 0;

        var numSamplesAdded = 0;

        // called by the generator to pump samples to the output
        function speakerChannel(channel, out, offset, length) {

            // soundchip _reset_ will advance the buffer 100000 cycles (or 4410 samples)
            //  which is rounded to buffer size of 4096
            //

            // the catchup() in updateSpeaker() will cause this to be called every time a sample can
            // be played, but it just buffers up the result and doesn't play it.
            // a real 'render' is when the length is about 2048 or higher

            // if (numSamplesAdded < length) {
            //     console.log("speakerChannel grabbing too many samples: " + (length-numSamplesAdded));
            // }


            var lastbit = speakerBuffer[speakerTime];
            for (var i = 0; i < length; ++i) {
                // got a real sample, so grab it.  If not, just keep using the last correct value
                if (i < numSamplesAdded)
                    lastbit = speakerBuffer[speakerTime & (speakerBufferSize - 1)];

                out[i + offset] += lastbit;
                speakerTime++;
            }

            if (numSamplesAdded > length) {
                // console.log("speakerChannel created too many samples: " + (numSamplesAdded-length));
                // skip past the sample created that cannot be played in time
                speakerTime += (numSamplesAdded-length);
            }

            numSamplesAdded = 0;

            while (speakerTime > speakerBufferSize) speakerTime -= speakerBufferSize;
        }

        // fill the buffer with the last value
        this.updateSpeaker = function(value, microCycle, seconds)
        {
            // value - true for 1, false for 0

            // calculate the number of buffer values to fill
            var deltaSeconds = seconds - lastSecond;
            var deltaCycles = microCycle - lastMicroCycle;

            // deltaSeconds is seconds since last last update
            // deltaCycles is microcycles since last update

            var totalCycles = outstandingCycles + deltaCycles + deltaSeconds / cpuFreq;

            //convert totalCycles to totalSamples at samplerate
            var totalSamples = (totalCycles * samplesPerCycle) | 0;

            if (totalSamples === 0)
                outstandingCycles = totalCycles;
            else
                outstandingCycles = totalCycles-(1/samplesPerCycle);

            var lastbit = speakerBuffer[bufferPos];

            if (totalSamples >= speakerBufferSize) {
                console.log("speaker buffer too small " + bufferPos + " " + totalSamples + " >= "+speakerBufferSize);
                // clear out the buffer with zeros
                outstandingCycles=0;
                bufferPos = 0;
            }
            else
            {
                // fill the buffer with the last value that was set
                for (var i = 0; i < totalSamples; ++i) {
                    speakerBuffer[bufferPos & (speakerBufferSize - 1)] = lastbit;
                    bufferPos++;
                }
                while (bufferPos > speakerBufferSize) bufferPos -= speakerBufferSize;
                numSamplesAdded+=totalSamples;
            }
            var newbit = value?1.0:0.0;

            // record the current value
            speakerBuffer[bufferPos] = newbit;

            // testAudio
            // samplesSinceLastValueChange+=totalSamples;
            // if ( lastbit != newbit ) {
            //     // samples since last change is only half a cycle so multiply by 2
            //     console.log("updateSpeaker frequency: " + sampleRate / (samplesSinceLastValueChange * 2) + "hz");
            //     samplesSinceLastValueChange=0;
            // }

            // running this program (from Atomic Theory and Practice) page 26
            // section 4.6.1 Labels - a to z
            // shows that the frequencies and sounds are right

            // 10 REM 322 Hz
            // 20 P=#B002
            // 30 FOR Z=0 TO 10000000 STEP 4;?P=Z;N.
            // 40 END


            // start the next update from this point
            lastSecond = seconds;
            lastMicroCycle = microCycle;
        };

        this.reset = function (hard) {
            if (!hard) return;
            for (var i = 0; i < 4; ++i) {
                counter[i] = 0;
                register[i] = 0;
                volume[i] = 0; // ideally this would be volumeTable[0] to get the "boo" of "boo...beep".  But startup issues make the "boo" all clicky.
            }
            noisePoked();
            advance(100000);
            this.setScheduler(scheduler);
        };
        this.enable = function (e) {
            enabled = e;
        };
        this.mute = function () {
            enabled = false;
        };
        this.unmute = function () {
            enabled = true;
        };
    }

    function FakeSoundChip() {
        this.reset = this.enable = this.mute = this.unmute = this.render = this.updateSlowDataBus = this.setScheduler = utils.noop;
        this.toneGenerator = this;
    }

    return {
        SoundChip: SoundChip,
        FakeSoundChip: FakeSoundChip
    };
});
