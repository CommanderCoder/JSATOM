define(['./utils'], function (utils) {
    "use strict";
    const PORTA = 0x0,
        PORTB = 0x1,
        PORTC = 0x2;

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
// a is 0,1,2  for b000, b001, b002
// v is not used
        function fPIAR(a, v) {
            return a - 1 ? aPPIA[a] : aKeys[aPPIA[0] & 15]
        }

// a is 0,1,2,3,... 15  for b000, b001, b002, b00n...
// v is value to store
        function fPIAW(a, v) {

        // 0,1,2 : sent to PPIA
        : a < 2 : store v in [a]
        : otherwise (i.e. a == 2) change only bits 2 & 3

           if (a < 3)
                aPPIA[a] =
                    a - 2 ? v :
                    (aPPIA[a] & 243) | (v & 12);
         : a >= 2 then 0
         : a == 1 then fmode&8
         : a == 0 then fmode>>4

          then set the fMode
            a ?
                a - 2 ?
                    0 :
                    fMode(nMode, v & 8 ? 1 : 0) :
                fMode(v >> 4, nPal)
        }

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
                        self.latchc = (self.portcpins & 243) | (val & 12);
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
                        // expecting 1 means unpressed, 0 means pressed
                        var n = self.keys[self.portapins & 15];
                        var r = 0;
                        for (var b =0;b<16;b++)
                            r+=!(n[b])<<b;
                        // console.log("reading "+(self.portapins & 15)+" and pressed "+n.toString(2)+" -> "+r.toString(2));
                        return r;
                    case PORTC:
                        self.recalculatePortCPins();
                        // console.log("read portc "+self.portcpins);
                        return self.portcpins;
                    default:
                        throw "Unknown PPIA read";
                }
            },

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
                self.portcpins = self.latchc;
                self.drivePortC();
                self.portCUpdated();
            },
        };
        return self;
    }

    function atomppia(cpu, video, initialLayout) {
        var self = ppia(cpu, 0x01);

        self.keys = [];
        for (var i = 0; i < 16; ++i) {
            self.keys[i] = new Uint8Array(16);
        }

        self.setKeyLayout = function (map) {
            self.keycodeToRowCol = utils.getKeyMap(map);
        };

        self.setKeyLayout(initialLayout);

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
        return self;
    }

    return {
        AtomPPIA: atomppia
    };
});
