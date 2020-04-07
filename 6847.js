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
         3          Not used / CSS

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
     1   X       X    X    0    0    0  Graphics CG1 (64x64x4)    (16 bpr)  #10
     1   X       X    X    0    0    1  Graphics RG1 (128x64x2)   (16 bpr)  #30
     1   X       X    X    0    1    0  Graphics CG2 (128x64x4)   (32 bpr)  #50
     1   X       X    X    0    1    1  Graphics RG2 (128x96x2)   (16 bpr)  #70
     1   X       X    X    1    0    0  Graphics CG3 (128x96x4)   (32 bpr)  #90
     1   X       X    X    1    0    1  Graphics RG3 (128x192x2)  (16 bpr)  #b0
     1   X       X    X    1    1    0  Graphics CG6 (128x192x4)  (32 bpr)  #d0
     1   X       X    X    1    1    1  Graphics RG6 (256x192x2)  (32 bpr)  #f0

http://members.casema.nl/hhaydn/howel/logic/6847_clone.htm

256 = 256/8 = 32   32x1bpp     = reg1:32  0x20
128 = 128/8 = 16   16x2bpp     = reg1:32  0x20

128 = 128/8 = 16   16x1bpp     = reg1:16 (xscale*2)  0x10
64 = 64/8 = 8      8x2bpp     = reg1:16 (xscale*2)  0x10


	// video mode constants
	//ppai PORTA
	 MODE_AG      = 0x10;  // alpha or graphics
	 MODE_GM2     = 0x80;  // only used if AG is 1
	 MODE_GM1     = 0x40; // only used if AG is 1
	 MODE_GM0     = 0x20; // only used if AG is 1

//ppai PORTC
	 MODE_CSS     = 0x08;  // colour select

	 // WITHIN THE VIDEO MEMORY (bit 6, 6, 7)  (AS, INTEXT, INV resp.)
	 // A/S, INT/EXT, CSS and INV can be changed character by character
	 // these not used if AG is 1, GM not used if AG is 0
	 MODE_AS      = 0x04;
	 MODE_INTEXT  = 0x02;
	 MODE_INV     = 0x01;

*/

    const MODE_AG = 0x80,
        MODE_GM2  = 0x40,
        MODE_GM1  = 0x20,
        MODE_GM0  = 0x10;



    function Video6847()
    {
        this.scanlineCounter = 0;
        this.levelDEW = false;
        this.levelDISPTMG = false;

        // 8 colours (alpha on MSB)
        //
        this.collook = utils.makeFast32(new Uint32Array([
            0xff000000, 0xff003f00, 0xff003f3f, 0xff3f0000,
            0xff00003f, 0xff3f3f3f, 0xff3f3f00, 0xff3f003f,
            0xff00203f]));
        // { 0,  0,  0  }, /*Black 0*/
        // { 0,  63, 0  }, /*Green 1*/
        // { 63, 63, 0  }, /*Yellow 2*/
        // { 0,  0,  63 }, /*Blue 3 */
        // { 63, 0,  0  }, /*Red 4 */
        // { 63, 63, 63 }, /*Buff 5*/
        // { 0,  63, 63 }, /*Cyan 6*/
        // { 63, 0,  63 }, /*Magenta 7*/
        // { 63, 32,  0  }, /*Orange 8 - actually red on the Atom*/


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



    Video6847.prototype.blitPixels = function ( buf, data, destOffset, mode)
    {
        var scanline = this.scanlineCounter;
        // bitpattern from data is either 4 or 8 pixels in raw graphics
        // either white and black
        // or 3 colours and black (in pairs of bits)
        // that is: all graphics modes are 1bpp or 2bpp giving 2 colours or 4 colours
        mode |= 0;
        var css = (mode & 0x08) >>> 2;

        var bitdef = data;
        var pixelsPerBit = 4;
        var bpp = 2;
        var colour = 0xffffffff; //white  - see 'collook'  // alpha, blue, green, red
        if (mode == 0xf0) //4
        {
            pixelsPerBit = 2;
            bpp = 1;
            colour = 0xff00ff00;
        }
        else if (mode == 0xb0)  //3
        {
            pixelsPerBit = 4;
            bpp = 1;
            colour = 0xff0000ff;

        }
        else if (mode == 0x70) //2
        {
            pixelsPerBit = 4;
            bpp = 1;
            colour = 0xffff0000;

        }
        else if (mode == 0x30) //1
        {
            pixelsPerBit = 4;
            bpp = 1;
            colour = 0xffff00ff;

        }
        else if (mode == 0xd0) //4a
        {
            pixelsPerBit = 2;
            bpp = 2;
            colour = 0xffff0000;

        }
        else if (mode == 0x90) //3a
        {
            pixelsPerBit = 1;
            bpp = 1;
            colour = 0xffffffff;

        }
        else if (mode == 0x50) //2a
        {
            pixelsPerBit = 1;
            bpp = 1;
            colour = 0xffffffff;

        }
        else if (mode == 0x10)  //1a
        {
            pixelsPerBit = 1;
            bpp = 1;
            colour = 0xffffff00;
        }
// MODE NEED TO CHANGE THE RASTER SCAN
        // currently 32 x 16 - 256 x 192 (with 12 lines per row)

        // can get wide with 16 pixels

        destOffset |= 0;
        var fb32 = buf;
        var i = 0;

        // 8 or 4 bits
        // var pixelsPerBit = 2*xscale;  // draw two,four pixels for each bit in the data to fill the width.
        // var  numPixels = 8*pixelsPerBit;
        // for (i = 0; i < numPixels/bpp; i++) {
        //     var n = (numPixels/bpp) - 1 - i; // pixels in reverse order
        //     // get bits in pairs or singles
        //     var j = i*bpp;
        //     j=j/pixelsPerBit;
        //     // get both bits
        //     var cval = (bitdef>>>j)&0x11;
        //     // get just one bit
        //     if (bpp==1)
        //         cval &= 0x1;
        //
        //     fb32[destOffset + n] = (cval!=0)?colour:0x0;
        // }

        var numPixels = 8*pixelsPerBit;  //per char
        // draw two,four pixels for each bit in the data to fill the width.

        for (i = 0; i < numPixels; i++) {
            var n = (numPixels) - 1 - i; // pixels in reverse order

            // get bits in pairs or singles
            var j = i / pixelsPerBit;

            // get both bits
            var cval = (bitdef>>>j)&0x03;

            // get just one bit
            if (bpp == 1) {
                cval &= 0x01;
            }

            colour = this.collook[cval | css]<<2;

            fb32[destOffset + n] = fb32[destOffset + n + 1024] = colour;
        }


    }



    Video6847.prototype.blitChar = function ( buf, data, destOffset, numPixels, mode)
    {
        var scanline = this.scanlineCounter;
        var css = (mode & 0x08) >>> 1;
        var chr = data&0x7f;

        // 0 - 63 is alphachars green  (0x00-0x3f)
        // 64-127 is alphagraphics yellow (0x40-0x7f) bit 7 set (0x40)
        // 128 - 191 is alphachars inverted green (0x80-0xbf)
        // 192-255 is alphagraphics red (0xc0-0xff) bit 7 set (0x40)

        // invert the  char if bit 7 is set and bit 6 is not
        var inv = false;
        if ((data&0xC0) == 0x80)
        {
            inv = true;
        }

        var agmode = (data & 0x40);

        //bitpattern for chars is in rows; each char is 12 rows deep
        var chardef = this.curGlyphs[chr  * 12 + scanline];

        if (inv)
            chardef = ~chardef;

        numPixels |= 0;

        // can get wide with 16 pixels
        var pixelsPerBit = numPixels/8;

        destOffset |= 0;
        var fb32 = buf;
        var i = 0;
        for (i = 0; i < numPixels; ++i) {
            var n = numPixels-1 - i; // pixels in reverse order
            var j = i / pixelsPerBit;
            var fgcol = this.collook[css?4:1];

            if (agmode) // alphagraphics
            {
                // 2 or 4 - yellow/red
                fgcol = this.collook[1+(data>>>6 | css)];
            }

            var colour = ((chardef>>>j)&0x1)?fgcol:this.collook[0];
            fb32[destOffset + n] =
                fb32[destOffset + n + 1024 ] =  // two lines
                    colour<<2;
        }

    }

    return Video6847;
});



/* Video modes:
Alpha internal
Alpha external
SemiGraphics Four  0011 CLEAR 1
SemiGraphics Six   0111 CLEAR 2

0001 ?#B000=#10  1a
Colour Graphics 1 - 8 colours (CSS/C1/C0)  - 64x64
1024 bytes - 2bpp (4x3)  - 4 pixels x 3 rows

0011 clear 1
Resolution Graphics 1 - 4 colours (Lx) - 128x64
1024 bytes - 1bpp (3x3)

0101  ?#B000=#50  2a
Colour Graphics 2 - 8 colours (CSS/C1/C0) - 128x64
2048 bytes - 2bpp (3x3)
1011  CLEAR 2
Resolution Graphics 2 - 4 colours (Lx) - 128x96
1536 bytes - 1bpp (2x2)

1001  ?#B000=#90  3a
Colour Graphics 3  - 8 colours (CSS/C1/C0) - 128x96
3072 bytes - 2bpp (2x2)
1011  clear 3
Resolution Graphics 3 - 4 colours (Lx)- 128x192
3072 bytes - 1bpp (2x1)

110  ?#B000=#d0  4a
Colour Graphics 6 - 8 colours (CSS/C1/C0) - 128x192
6144 bytes - 2bpp (4x1)
1111  clear 4
Resolution Graphics 6 - 4 colours (Lx) 256x192
6144 bytes - 1bpp  (8x1)


 */
