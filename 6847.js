define(['./6847_fontdata', './utils'], function (fontData, utils) {
    "use strict";


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



    AG  AS  INTEXT  INV  GM2  GM1  GM0
    --  --  ------  ---  ---  ---  ---
     0   0       0    0    X    X    X  Internal Alphanumerics
     0   0       0    1    X    X    X  Internal Alphanumerics Inverted
     0   0       1    0    X    X    X  External Alphanumerics
     0   0       1    1    X    X    X  External Alphanumerics Inverted
     0   1       0    X    X    X    X  Semigraphics 4
     0   1       1    X    X    X    X  Semigraphics 6
     1   X       X    X    0    0    0  Graphics CG1 (64x64x4)    (16 bpr)
     1   X       X    X    0    0    1  Graphics RG1 (128x64x2)   (16 bpr)
     1   X       X    X    0    1    0  Graphics CG2 (128x64x4)   (32 bpr)
     1   X       X    X    0    1    1  Graphics RG2 (128x96x2)   (16 bpr)
     1   X       X    X    1    0    0  Graphics CG3 (128x96x4)   (32 bpr)
     1   X       X    X    1    0    1  Graphics RG3 (128x192x2)  (16 bpr)
     1   X       X    X    1    1    0  Graphics CG6 (128x192x4)  (32 bpr)
     1   X       X    X    1    1    1  Graphics RG6 (256x192x2)  (32 bpr)

http://members.casema.nl/hhaydn/howel/logic/6847_clone.htm


	// video mode constants
	//ppai PORTA
	 MODE_AG      = 0x80;  // alpha or graphics
	 MODE_GM2     = 0x40;  // only used if AG is 1
	 MODE_GM1     = 0x20; // only used if AG is 1
	 MODE_GM0     = 0x10; // only used if AG is 1

//ppai PORTC
	 MODE_CSS     = 0x08;  // colour select

	 // WITHIN THE VIDEO MEMORY (bit 6, 6, 7)  (AS, INTEXT, INV resp.)
	 // A/S, INT/EXT, CSS and INV can be changed character by character
	 // these not used if AG is 1, GM not used if AG is 0
	 MODE_AS      = 0x04;
	 MODE_INTEXT  = 0x02;
	 MODE_INV     = 0x01;

*/



    function Video6847()
    {
        this.scanlineCounter = 0;
        this.levelDEW = false;
        this.levelDISPTMG = false;


        this.init = function() {
            this.curGlyphs = fontData.makeCharsAtom();
        };


        this.init();
    }

    Video6847.prototype.setDEW = function (level) {

        // The SAA5050 input pin "DEW" is connected to the 6845 output pin
        // "VSYNC" and it is used to track frames.
        var oldlevel = this.levelDEW;
        this.levelDEW = level;

        // Trigger on high -> low. This appears to be what the hardware does.
        // It needs to be this way for the scanline counter to stay in sync
        // if you set R6>R4.
        if (!oldlevel || level) {
            return;
        }


        this.scanlineCounter = 0;
    };

    Video6847.prototype.setDISPTMG = function (level) {

        // The SAA5050 input pin "LOSE" is connected to the 6845 output pin
        // "DISPTMG" and it is used to track scanlines.
        var oldlevel = this.levelDISPTMG;
        this.levelDISPTMG = level;

        // Trigger on high -> low. This is probably what the hardware does as
        // we need to increment scanline at the end of the scanline, not the
        // beginning.
        if (!oldlevel || level) {
            return;
        }



        this.scanlineCounter++;
        // Check for end of character row.
        if (this.scanlineCounter === 12) {
            this.scanlineCounter = 0;
        }
    };


    Video6847.prototype.blitChar = function ( buf, data, destOffset, numPixels, mode)
    {
        var scanline = this.scanlineCounter;
        var chardef = this.curGlyphs[data  * 12 + scanline];




        destOffset |= 0;
        numPixels |= 0;
        var fb32 = buf;
        var i = 0;
        for (i = 0; i < numPixels; ++i) {
            var n = numPixels-1 - i; // pixels in reverse order
            fb32[destOffset + n] = ((chardef>>>i)&0x1)?0xffffffff:0x0; //white  - see 'collook'
        }

    }

    return Video6847;
});
