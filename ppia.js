define(['./utils'], function (utils) {
    "use strict";
    const PORTA = 0x0,
        PORTB = 0x1,
        PORTC = 0x2,
    CREG=0x3; // control register

    /*
 http://mdfs.net/Docs/Comp/Acorn/Atom/atap25.htm

 25.5 Input/Output Port Allocations
 The 8255 Programmable Peripheral Interface Adapter contains three 8-bit ports, and all but one of these lines is used by the ATOM.

 Port A - #B000
        Output bits:      Function:
             0 - 3      Keyboard row
             4 - 7      Graphics mode

 Port B - #B001
        Input bits:       Function:
             0 - 5      Keyboard column
               6        CTRL key (low when pressed)
               7        SHIFT keys {low when pressed)

 Port C - #B002
        Output bits:      Function:
             0          Tape output
             1          Enable 2.4 kHz to cassette output
             2          Loudspeaker
             3          Not used

        Input bits:       Function:
             4          2.4 kHz input
             5          Cassette input
             6          REPT key (low when pressed)
             7          60 Hz sync signal (low during flyback)
 The port C output lines, bits 0 to 3, may be used for user applications when the cassette interface is not being used.


Hardware:   PPIA 8255

output  b000    0 - 3 keyboard row, 4 - 7 graphics mode
 b002    0 cas output, 1 enable 2.4kHz, 2 buzzer, 3 colour set

input   b001    0 - 5 keyboard column, 6 CTRL key, 7 SHIFT key
 b002    4 2.4kHz input, 5 cas input, 6 REPT key, 7 60 Hz input



            // http://mdfs.net/Docs/Comp/Acorn/Atom/MemoryMap

            B000    PPIA I/O Device
                  &B000 b7-b4: 6847 video mode
                  &B000 b3-b0: keyboard matix row, defaults to 0 so &B001 reads
                          Escape. Setting &B000 to 10 (or anything larger than 9)
                          "disables" background escape checking.

                  &B001 - keyboard matrix column:
                       ~b0 : SPC  [   \   ]   ^  LCK <-> ^-v Lft Rgt
                       ~b1 : Dwn Up  CLR ENT CPY DEL  0   1   2   3
                       ~b2 :  4   5   6   7   8   9   :   ;   <   =
                       ~b3 :  >   ?   @   A   B   C   D   E   F   G
                       ~b4 :  H   I   J   K   L   M   N   O   P   Q
                       ~b5 :  R   S   T   U   V   W   X   Y   Z  ESC
                       ~b6 :                                          Ctrl
                       ~b7 :                                          Shift
                              9   8   7   6   5   4   3   2   1   0

                  &B002 - various I/O
                       ~b0 -> CASOUT
                       ~b1 -> CASOUT
                       ~b2 -> Speaker
                       ~b3 -> VDU CSS
                       ~b4 <- CAS
                       ~b5 <- CASIN
                       ~b6 <- REPEAT key
                       ~b7 <- VSync






*/
    function ppia(cpu, irq) {
        var self = {
            latcha:0, latchb:0, latchc:0,
            portapins:0, portbpins:0, portcpins: 0,
            cr:0,
            processor:cpu,

            reset: function (hard) {
                //http://members.casema.nl/hhaydn/8255_pin.html
                self.latcha = self.latchb = self.latchc = 0x00;

            },

            setVBlankInt: function (level) {
//means - in VSync if true
                // FE66_wait_for_flyback_start will loop until bit 7 of B002 is 0
                //then
                // FE6B_wait_for_flyback will loop until bit 7 of B002 is 1

                //60 Hz sync signal - normally 1, but goes zero at start of  flyback.
               if (level )
               {
                 self.latchc |= 0x80;
               }
               else
               {
                self.latchc &= 0x7f;
               }
               self.recalculatePortCPins();
                //console.log("xvblank "+level+"; portc "+self.portcpins);
            },

            polltime: function (cycles) {
                cycles |= 0;
            },
/*
 Port C - #B002
        Output bits:      Function:
             0          Tape output
             1          Enable 2.4 kHz to cassette output
             2          Loudspeaker
             3          Not used

        Input bits:       Function:
             4          2.4 kHz input
             5          Cassette input
             6          REPT key (low when pressed)
             7          60 Hz sync signal (low during flyback)
 The port C output lines, bits 0 to 3, may be used for user applications when the cassette interface is not being used.

 */
            write: function (addr, val) {

                val |= 0;
                switch (addr & 0xf) {
                    case PORTA:
                        self.latcha = val;
                        // console.log("write porta "+self.latcha);
                        self.recalculatePortAPins();
                        break;

                    case PORTB:
                        self.latchb = val;
                        // console.log("write portb "+self.latchb);
                        self.recalculatePortBPins();
                        break;

                    case PORTC:
                        //11110000 - 0xF0
                        //00001111 - 0x0F -- only write to the bottom 4 bits
                        self.latchc = (self.portcpins & 0xF0) | (val & 0x0F);

                        if (self.portcpins & 0x01)
                            console.log("casout");
                        if (self.portcpins & 0x02) {
                            console.log("hzout");
                        }
                        // console.log("write portc "+self.latchc);
                        self.recalculatePortCPins();
                        break;

                }
            },

            read: function (addr) {

                switch (addr & 0xf) {
                    case PORTA:
                        self.recalculatePortAPins();
                        // console.log("read porta "+self.portapins);
                        return self.portapins;
                    case PORTB:
                        self.recalculatePortBPins();
                        // return the keys based on values in porta
                        // console.log("read portb "+self.portbpins);
                        // expecting 1 means unpressed, 0 means pressed: but keymap has 1 if pressed and 0 if unpressed
                        var n = self.keys[self.portapins & 15];
                        var r = 0;
                        for (var b =0;b<16;b++)
                            r+=!(n[b])<<b;
                        // if (self.portapins & 15 == 9)
                        //     console.log("reading "+(self.portapins & 15)+" and pressed "+n.toString(2)+" -> "+r.toString(2));

                        // for CTRL and SHIFT which doesn't use porta - they just set bit 6 and bit 7
                        // the keymap assumes CTRL and SHIFT read from row0
                        // fixup CTRL and SHIFT regardless of the row being read
                        var ctrl_shift = !self.keys[0][7]<<7 + !self.keys[0][6]<<6 ;
                        r |= (ctrl_shift&0xc0);

                        return r;
                    case PORTC:
                        self.recalculatePortCPins();
                        // console.log("read portc "+self.portcpins);
                        // only read top 4 bits
                        // if (self.portcpins & 0x20)
                        //     console.log("casin");
                        // if (self.portcpins & 0x10) {
                        //     console.log("hzin");
                        // }

                        // only read top 4 bits
                        var val =  self.portcpins & 0xF0;

                        var flyback = self.portcpins & 0x80;
                        var rept = self.portcpins & 0x40;  // low when pressed
                        var casin = self.portcpins & 0x20; //
                        var hzin = self.portcpins & 0x10;

                        var casbit = casin?1:0;


                        var rept_key = !self.keys[1][6]<<6 ;
                        r |= (rept_key&0x40);

                        // TAPE - 0xfc0a  (every 3.340ms/3340us), -OSBGET Get Byte from Tape subroutine; get a bit and count duration of tape pulse (using FCD2)
                        // TAPE - 0xfcd2  (every 0.033ms/3.3us), -Test state of #B002 tape input pulse subroutine (has there been a change?)
                        // TAPE - 0xFCC2 (every 8.446ms/8446us), -Count Duration of Tape Pulse subroutine (<8 loops, >=8 loops)
                        // FLYBACK - 0xfe6e, 0XFE9D, 0xfe69,
                        var myPC = self.processor.pc;
                        if (!([0xfe6e, 0XFE9D, 0xfe69, 0xfcd2].includes(myPC)))
                        {
                            var clocksPerSecond = (1 * 1000 * 1000) | 0;
                            var millis = self.processor.cycleSeconds * 1000 + self.processor.currentCycles / (clocksPerSecond / 1000);
                            var tt = millis - self.lastTime;
                            self.lastTime = millis;

                            // for fc0a - it is called every 3.34ms and in this time it should change from 0 to 1 either
                            // 8 or 16 times (which the ASM compares against 12)

                            // this is called once every 33 clock cycles from FCCF
                            // there are 6 calls this between every change
                            // of a bit due to 'receiveBit'.

                            // if([0xfc0a,0xFCC2].includes(myPC) )
                            // {
                            //     console.log("." + myPC.toString(16) + " ppia_read " + ((val&0x20)>>5) + " at " + self.processor.cycleSeconds + "seconds, " + self.processor.currentCycles + "cycles ("+tt+") } ");
                            // }
                            // else
                            // {
                            //     console.log("#" + self.processor.pc.toString(16) + " ppia_read " + val.toString(2).padStart(8, '0') + " at " + self.processor.cycleSeconds + "seconds, " + self.processor.currentCycles + "cycles ("+tt+") } ");
                            // }

                            if (casbit != self.prevcas) {

//                            var t = millis - self.lasttime;
//                            self.lasttime = millis;
                                self.prevcas = casbit;
                                // console.log("#" + self.processor.pc.toString(16) + " ppia_read casin switched to " + self.prevcas + " } ");
                            }

                            //console.log("} "+(flyback?"F":"_")+(rept?"_":"R")+(casin?"1":"0")+(hzin?"h":"_"));
//                        console.log("} "+val.toString(2).padStart(10,'0'));
                        }
                        return val;
                    default:
                        throw "Unknown PPIA read";
                }
            },

            prevcas:0,

            recalculatePortAPins: function () {
                self.portapins = self.latcha;
                self.drivePortA();
                self.portAUpdated();
            },

            recalculatePortBPins: function () {
                self.portbpins = self.latchb;
                self.drivePortB();
                self.portBUpdated();
            },

            recalculatePortCPins: function () {
                // make sure REPT key is HIGH (low means pressed)
                self.latchc |= 1<<6;

                self.portcpins = self.latchc;
                self.drivePortC();
                self.portCUpdated();
            },

        };
        return self;
    }

    function atomppia(cpu, video, initialLayout, scheduler, toneGen) {
        var self = ppia(cpu, 0x01);

        self.keys = [];
        for (var i = 0; i < 16; ++i) {
            self.keys[i] = new Uint8Array(16);
        }

        self.setKeyLayoutA = function (map) {
            self.keycodeToRowCol = utils.getKeyMapAtom(map);
        };

        self.setKeyLayoutA(initialLayout);

        self.keyboardEnabled = true;

        function clearKeys() {
            for (var i = 0; i < self.keys.length; ++i) {
                for (var j = 0; j < self.keys[i].length; ++j) {
                    self.keys[i][j] = false;
                }
            }
            self.updateKeys();
        }

        self.clearKeys = clearKeys;

        self.disableKeyboard = function () {
            self.keyboardEnabled = false;
            clearKeys();
        };

        self.enableKeyboard = function () {
            self.keyboardEnabled = true;
            clearKeys();
        };

        self.set = function (key, val, shiftDown) {
            if (!self.keyboardEnabled) {
                return;
            }

            var colrow = self.keycodeToRowCol[!!shiftDown][key];
            if (!colrow) {
                console.log("Unknown keycode: " + key);
                console.log("Please check here: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent.keyCode");
                return;
            }

            // console.log(" keycode: " + colrow[0] +","+colrow[1]+":"+val);
            self.keys[colrow[0]][colrow[1]] = val;
            self.updateKeys();
        };
        self.keyDown = function (key, shiftDown) {
            self.set(key, 1, shiftDown);
        };
        self.keyUp = function (key) {
            // set up for both keymaps
            // (with and without shift)
            self.set(key, 0, true);
            self.set(key, 0, false);
        };

        self.keyDownRaw = function (colrow) {
            self.keys[colrow[0]][colrow[1]] = 1;
            self.updateKeys();
        };
        self.keyUpRaw = function (colrow) {
            self.keys[colrow[0]][colrow[1]] = 0;
            self.updateKeys();
        };
        self.keyToggleRaw = function (colrow) {
            self.keys[colrow[0]][colrow[1]] = 1 - self.keys[colrow[0]][colrow[1]];
            self.updateKeys();
        };
        self.hasAnyKeyDown = function () {
            // 10 for ATOM
            var numCols = 10;
            var i, j;
            for (i = 0; i < numCols; ++i) {
                for (j = 0; j < 8; ++j) {
                    if (self.keys[i][j]) {
                        return true;
                    }
                }
            }
            return false;
        };

        self.updateKeys = function () {


        };

        self.portAUpdated = function () {
            self.updateKeys();
        };

        self.portBUpdated = function () {
            // v = self.latchb
            // fMode(nMode, v & 8 ? 1 : 0) :
        };

        self.portCUpdated = function () {
            // v = self.latchc;
        //    fMode(v >> 4, nPal)

        };

        self.drivePortA = function () {
            self.updateKeys();
        };

        self.drivePortB = function () {
            // Nothing driving here.
        };

        self.drivePortC = function () {
            // Nothing driving here.
        };

        self.reset();


        // ATOM TAPE SUPPORT

        // set by TAPE
        self.tone = function (freq) {
            if (!freq) toneGen.mute();
            else toneGen.tone(freq);
        };

        // set by TAPE
        self.setTapeCarrier = function (level) {
            if (!level) {
                self.tapeCarrierCount = 0;
                self.tapeDcdLineLevel = false;
            } else {
                self.tapeCarrierCount++;
                // The tape hardware doesn't raise DCD until the carrier tone
                // has persisted for a while. The BBC service manual opines,
                // "The DCD flag in the 6850 should change 0.1 to 0.4 seconds
                // after a continuous tone appears".
                // Star Drifter doesn't load without this.
                // We use 0.174s, measured on an issue 3 model B.
                // Testing on real hardware, DCD is blipped, it lowers about
                // 210us after it raises, even though the carrier tone
                // may be continuing.
                if (self.tapeCarrierCount === 209) {
                    self.tapeDcdLineLevel = true;
                } else {
                    self.tapeDcdLineLevel = false;
                }
            }
            self.dcdLineUpdated();
        };
        self.dcdLineUpdated = function () {

        };

        self.lastTime = 0;
        // receive is set by the TAPE POLL
        self.receiveBit = function (bit) {
            var clocksPerSecond = (1 * 1000 * 1000) | 0;
            var millis = self.processor.cycleSeconds * 1000 + self.processor.currentCycles / (clocksPerSecond / 1000);


 //           var t = millis - self.lasttime;
 //           self.lasttime = millis;
            bit |= 0;
            var casin = (self.portcpins & 0x20)>>5; //

            self.latchc = (self.portcpins & 0xdf) | (bit << 5);

            // this is called once every 208 clock cycles (208us or 0.2ms at 1Mhz)

            /*
            for this to be recognised as a '1'; it needs to be 4 cycles at 1.2khz (or is this '0') - duration of tape pulse < 8
            for this to be recognised as a '0'; it needs to be 8 cycles at 2.4khz (or is this '1')
             leader tone is a '1' - so reading 8 half cycles at 2.4khz

             */

            // console.log("#  receiveBit " + self.latchc.toString(2).padStart(8, '0') + " at " + self.processor.cycleSeconds + "seconds, " + self.processor.currentCycles + "cycles } ");

            // if (casin != bit) {
            //     // var flyback = self.latchc & 0x80;
            //     // var rept = self.latchc & 0x40;  // low when pressed
            //     casin = self.latchc & 0x20; //
            //     var hzin = self.latchc & 0x10;
            //     console.log("> " + millis.toFixed(1) + " portcpins " + (casin | hzin).toString(2).padStart(10, '0'));
            // }
        };


        self.receive = function (byte) {
            byte |= 0;
            // if (self.sr & 0x01) {
            //     // Overrun.
            //     // TODO: this doesn't match the datasheet:
            //     // "The Overrun does not occur in the Status Register until the
            //     // valid character prior to Overrun has been read."
            //     console.log("Serial overrun");
            //     self.sr |= 0xa0;
            // } else {
            //     self.dr = byte;
            //     self.sr |= 0x81;
            // }

            console.log("[ "+byte.toString(16) + " : " + String.fromCharCode(byte));
            updateIrq();
        };

        self.setTape = function (tape) {
            self.tape = tape;
        };

        self.counterTimer = null;
        self.tape_counter = 0;

        self.rewindTape = function () {
            if (self.tape) {
                console.log("rewinding tape");
                self.tape.rewind();
                self.tape_counter = 0;
                var display_div = $("#counter_id");
                var display_str = "";
                display_str = self.tape_counter.toString().padStart(8,'0');
                for (var i = 0; i < display_str.length; i++) {
                    display_div.append("<span class='cas counter num_tiles'>"+display_str[i]+"</span>");
                }
            }
        };


        self.playTape = function () {
            if (self.tape) {
                console.log("playing tape");
                //start
                self.runTape();

                var display_div = $("#counter_id");
                function incrementCount(){
                    self.counterTimer = setInterval(function(){
                        // clear count
                        display_div.empty();

                        self.tape_counter++;
                        if (self.tape_counter > 100000) {
                            self.tape_counter = 0; // reset count
                        }
                        var display_str = "";
                        display_str = self.tape_counter.toString().padStart(8,'0');
                        for (var i = 0; i < display_str.length; i++) {
                            display_div.append("<span class='cas counter num_tiles'>"+display_str[i]+"</span>");
                        }
                    },1000);
                }


                // example of a counter.
                incrementCount();

            }
        };

        self.stopTape = function () {
            if (self.tape) {
                console.log("stopping tape");

                toneGen.mute();
                self.runTapeTask.cancel();
                self.setTapeCarrier(false);

                clearInterval(self.counterTimer);
                self.counterTimer = null;
            }
        };

        function runTape() {
            if (self.tape) self.runTapeTask.reschedule(self.tape.poll(self));
        }

        function updateIrq()
        {}

        self.updateIrq = updateIrq;//?
        self.runTape = runTape;// ?

        self.runTapeTask = scheduler.newTask(runTape);



        return self;
    }

    return {
        AtomPPIA: atomppia
    };
});


/*
pia 8255 - 0x3fc mirror : device read/write
6522 - 0x3f0 mirror

int m_hz2400;
int m_pc0;
int m_pc1;




 */
