"use strict";
import * as utils from "./utils.js";
import * as fontData from "./6847_fontdata.js";

const VDISPENABLE = 1 << 0,
    HDISPENABLE = 1 << 1,
    FRAMESKIPENABLE = 1 << 5;
// , EVERYTHINGENABLED = VDISPENABLE | HDISPENABLE | FRAMESKIPENABLE
/*
http://mdfs.net/Docs/Comp/Acorn/Atom/atap25.htm

25.5 Input/Output Port Allocations
The 8255 Programmable Peripheral Interface Adapter contains three 8-bit ports, and all but one of these lines is used by the ATOM.

Port A - #B000
    Output bits:      Function:
         0 - 3      Keyboard row
         4 - 7      Graphics mode



Hardware:   PPIA 8255

output  b000    0 - 3 keyboard row, 4 - 7 graphics mode
b002    0 cas output, 1 enable 2.4kHz, 2 buzzer, 3 colour set

input   b001    0 - 5 keyboard column, 6 CTRL key, 7 SHIFT key
b002    4 2.4kHz input, 5 cas input, 6 REPT key, 7 60 Hz input



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


	 for bits

	 CG1, CG2, CG3, CG6, RG6 are 2bpp
	 RG1, RG2, RG3 are 1bpp

?#B002=8
F.I=0TO255;I?#8000=I;N.

text colours are black/green (css=0) and black/orange (css=1); border black always
css not used for semigraphics 4 : THIS IS NOT AVAILABLE ON ATOM?
css is used for semigraphics 6,
they use 4 bits and 6 bits for luminance (0 off, 1 on)
and the last 2 or 3 bits are used for colour
(UNAVAILABLE) SG4 : 3 bits : 8 colours + black: green, yellow, blue, red , buff, cyan, magenta, orange
(PARTIALLY AVAILABLE) SG6 : 2 bits : 4 colours + black: css = 0, green, yellow, blue, red, css=1, buff, cyan, magenta, orange
only 1 bit is used of SG6 - to get yellow/red, cyan/orange
*/

// const MODE_AG = 0x80,
//     MODE_GM2  = 0x40,
//     MODE_GM1  = 0x20,
//     MODE_GM0  = 0x10;

export function Video6847(video) {
    this.video = video;
    this.levelDEW = false;
    this.levelDISPTMG = false;

    // 8 colours (alpha on MSB)
    //
    this.collook = utils.makeFast32(
        new Uint32Array([
            0xff000000, 0xff00ff00, 0xff00ffff, 0xffff0000, 0xff0000ff, 0xffffffff, 0xffffff00, 0xffff00ff, 0xff0080ff,
        ])
    );
    // { 0,  0,  0  }, /*Black 0*/
    // { 0,  63, 0  }, /*Green 1*/
    // { 63, 63, 0  }, /*Yellow 2*/
    // { 0,  0,  63 }, /*Blue 3 */
    // { 63, 0,  0  }, /*Red 4 */
    // { 63, 63, 63 }, /*Buff 5*/
    // { 0,  63, 63 }, /*Cyan 6*/
    // { 63, 0,  63 }, /*Magenta 7*/
    // { 63, 32,  0  }, /*Orange 8 - actually red on the Atom*/

    this.regs = new Uint8Array(32);
    this.bitmapX = 0;
    this.bitmapY = 0;
    this.frameCount = 0;
    this.inHSync = false;
    this.inVSync = false;

    this.horizCounter = 0;
    this.vertCounter = 0;
    this.scanlineCounter = 0;
    this.addr = 0;
    this.lineStartAddr = 0;
    this.nextLineStartAddr = 0;

    this.pixelsPerChar = 8;

    this.bitmapPxPerPixel = 2; // each pixel is 2 bitmap pixels wide and high
    this.pixelsPerBit = this.bitmapPxPerPixel;
    this.bpp = 1;

    this.init = function () {
        this.curGlyphs = fontData.makeCharsAtom();
    };

    this.init();

    this.reset = function (cpu, ppia) {
        this.cpu = cpu;
        this.ppia = ppia;
    };

    // USE PAINT from VIDEO
    this.paint = function () {
        this.video.paint();
    };

    this.clearPaintBuffer = function () {
        this.video.interlacedSyncAndVideo = this.interlacedSyncAndVideo;
        this.video.doubledScanlines = this.doubledScanlines;
        this.video.frameCount = this.frameCount;
        this.video.bitmapX = this.bitmapX;
        this.video.bitmapY = this.bitmapY;
        this.video.clearPaintBuffer();
    };
    // END

    this.paintAndClear = function () {
        // skip 5 frames
        if (this.dispEnabled & FRAMESKIPENABLE) {
            this.paint();
            this.clearPaintBuffer();
        }
        // this.dispEnabled &= ~FRAMESKIPENABLE;
        var enable = FRAMESKIPENABLE;
        // if (this.frameCount % 5) enable = 0;
        this.dispEnabled |= enable;

        this.bitmapY = 0;
    };

    // atom video memory is 0x8000->0x9fff (8k but only bottom 6k used)
    this.readVideoMem = function () {
        var memAddr = this.addr & 0x1fff; //6k
        memAddr |= 0x8000;
        return this.cpu.videoRead(memAddr);
    };

    this.dispEnableSet = function (flag) {
        this.dispEnabled |= flag;
    };

    this.dispEnableClear = function (flag) {
        this.dispEnabled &= ~flag;
    };

    //PAL based = 312 lines
    //NTSC based = 262 lines
    // initialiser is outside the function to improve performance
    this.modes = {
        //perchar  ,  pixpb,lines, bpp
        0xf0: [8, 1, 1, 1], //clear4  256x192x2,  pixels 1w1h   MAIN MENU
        0xb0: [16, 2, 1, 1], //clear3  128x192x2, pixels  2w1h   BABIES
        0x70: [16, 2, 2, 1], //clear2  128x96x2, pixels  2w2h  3D ASTEROIDS
        0x30: [16, 2, 3, 1], //clear1   128x64x2 , pixels  3w4h (2w4h) 3D MAZE
        0xd0: [8, 2, 1, 2], //?#B000=#D0  128x192x4,pixels  2w1h CHUCKIE EGG
        0x90: [8, 2, 2, 2], //?#B000=#90  128x96x4, pixels 2w2h  FLAPPY BIRD
        0x50: [8, 2, 3, 2], //?#B000=#50  128x64x4 , pixels 3w3h (4w3h) BREAKOUT (maingame)
        0x10: [16, 4, 3, 2], //?#B000=#10  64x64x4 , pixels 4w3h  FIZZLE BRICKS
        0x00: [8, -1, 12, 1], // clear0 //0,0 not used on Mode 0 (uses blitChar), pixelsPerBit, bpp
    };

    // THESE MIDDLE THREE NUMBERS - THE SECOND AND THIRD ONE AFFECT THE VSYNC TIMING
    // first is end of frame - i.e. full lines to display
    // second is vsync start based on vertcounter
    // third is total lines in a full frame
    // vpulsewidth is how far through the individual scanline to end the vsync - i.e. sub scanline tine

    this.lastmode = 0xff;

    this.setValuesFromMode = function (mode) {
        mode = mode & 0xf0;

        // if no change in mode then do nothing
        if (this.lastmode === mode) return;

        this.lastmode = mode;

        this.pixelsPerChar = this.modes[mode][0]; // 8 pixels per element
        this.pixelsPerBit = this.bitmapPxPerPixel * this.modes[mode][1];
        var linesPerRow = this.modes[mode][2]; // move to reg9
        this.bpp = this.modes[mode][3];

        this.charLinesreg9 = linesPerRow - 1; //2  - scanlines per char

        //NEED TO RESET THE LINE IF
        //MODE SWITCH MID FRAME
        this.scanlineCounter = 0;
        this.lineStartAddr = this.nextLineStartAddr;
    };

    this.lastseconds = 0;

    this.vdg_cycles = 0;
    this.charTime = 0;

    // ATOM uses 6847 chip
    this.polltime = function (clocks) {
        var mode = this.ppia.portapins & 0xf0;
        var css = (this.ppia.portcpins & 0x08) >>> 2;
        this.setValuesFromMode(mode);

        var vdgcharclock = this.pixelsPerChar / 2; // 4 or 8
        var vdgclock = 3.638004; // This ought to be 3.579545, but this looks better with the INTs being used.
        this.vdg_cycles += clocks * vdgclock;

        var vdgframelines = 262; //  312 PAL (but no pal on standard atom)  262; // NTSC
        var vdglinetime = 228; // vdg cycles to do a line; not 227.5

        // full bordered width is 185.5 cycles
        // (185.5+42 = 227.5)
        var HBNK = 42; // left border start (16.5+25.5)
        var leftborder = 29; // 29.5
        var displayH = 128; //cycles - 186 cycles including borders - 228 for full horizontal
        var rightborder = 29; //28.5

        // total = 29+29+128+42 = 228

        var vertblank = 13; //13
        var topborder = 25; //25
        var displayV = 192;
        // var bottomborder = 26; // 26 + 6 = 32 =  time in vsync
        // var vertretrace = 6;
        // ALL ADDS UP TO 262

        // in vsync for 32 lines = bottomborder+vertretrace
        // out vsync for 230 lines = vertblank+topborder+displayV

        while (this.vdg_cycles >= 0) {
            this.vdg_cycles -= 1;
            this.charTime -= 1;

            var nextChar = this.charTime <= 0;

            if (nextChar) {
                this.charTime += vdgcharclock;
                this.bitmapX += this.pixelsPerChar * this.bitmapPxPerPixel;
            }

            if (this.inHSync) {
                // Start at -ve pos because new character is added before the pixel render
                this.bitmapX = -this.pixelsPerChar * this.bitmapPxPerPixel;

                this.bitmapY += this.bitmapPxPerPixel;

                if (this.bitmapY >= 768) {
                    // Arbitrary moment when TV will give up and start flyback in the absence of an explicit VSync signal
                    this.paintAndClear();
                }
                this.inHSync = false;
            }

            // right border - record addr for next FULL line
            if (this.horizCounter === HBNK + leftborder + displayH) this.nextLineStartAddr = this.addr;

            // Stop drawing outside the right border
            if (this.horizCounter === HBNK + leftborder + displayH) {
                this.dispEnableClear(HDISPENABLE);
            }

            // left border - start the next line (not necessarily the FULL line)
            if (this.horizCounter === HBNK + leftborder) {
                this.dispEnableSet(HDISPENABLE);
                this.addr = this.lineStartAddr;
                this.charTime = 0;
            }

            // vertcounter runs from 0 to 262
            // got to the end, start again
            if (this.vertCounter === vertblank + topborder) {
                this.scanlineCounter = 0;
                this.nextLineStartAddr = 0;
                this.lineStartAddr = this.nextLineStartAddr;
                this.dispEnableSet(VDISPENABLE);
            }

            if (this.vertCounter === vertblank + topborder + displayV) {
                this.dispEnableClear(VDISPENABLE);
            }

            // reached end of the vdgline - start the hsync
            if (this.horizCounter === HBNK + leftborder + displayH + rightborder && !this.inHSync) {
                this.inHSync = true;
            }

            // image between 0 and 191 inc.
            // vsync start (1) at line 192
            // vsync end (0) at line 224
            // 32 lines between inVSync and !inVSync

            var vSyncEnding = false;
            var vSyncStarting = false;

            if (this.vertCounter === vertblank + topborder + displayV && !this.inVSync) {
                vSyncStarting = true;
                this.inVSync = true;
                // Frame Sync is high normally and
                // goes low when in VSync
                // in VSync for 32 lines, and
                // out of VSync for 262-32 lines
            }

            if (this.vertCounter === 0 && this.inVSync) {
                vSyncEnding = true;
                this.inVSync = false;
            }

            if (!vSyncStarting && vSyncEnding) {
                this.paintAndClear();
            }

            if (vSyncStarting || vSyncEnding) {
                this.ppia.setVBlankInt(this.inVSync);

                // if (vSyncEnding)
                // {
                //     var seconds = this.cpu.cycleSeconds+this.cpu.currentCycles/1000000.0;
                //     var diff = seconds - this.lastseconds;
                //     $("#vdg_text").html(
                //         "FPS "+(1/diff).toFixed(5)+"   ("+diff.toFixed(5)+")<br>"
                //     );
                //     this.lastseconds = seconds ?? 0;
                // }
            }

            if (nextChar) {
                // once the whole of the Vertical and Horizontal is complete then do this
                var insideBorder = (this.dispEnabled & (HDISPENABLE | VDISPENABLE)) === (HDISPENABLE | VDISPENABLE);
                if (insideBorder) {
                    //     read from video memory - uses this.addr
                    var dat = this.readVideoMem();

                    var offset = this.bitmapY;
                    offset = offset * 1024 + this.bitmapX;
                    // Render data depending on display enable state.
                    if (this.bitmapX >= 0 && this.bitmapX < 1024 && this.bitmapY < 625) {
                        {
                            // TODO: Add in the INTEXT modifiers to mode (if necessary)
                            // blit into the fb32 buffer which is painted by VIDEO
                            if ((mode & 0x10) === 0)
                                // MODE_AG - bit 4; 0x10 is the AG bit
                                this.blitChar(this.video.fb32, dat, offset, this.pixelsPerChar, css);
                            else this.blitPixels(this.video.fb32, dat, offset, css);
                        }
                    }
                } else {
                    let dat = 0xff;
                    // var insideTopBottomBorder = (this.dispEnabled & (HDISPENABLE | VDISPENABLE)) === (VDISPENABLE);
                    // dat = 0x2f;
                    // if (insideTopBottomBorder)
                    //     dat = 0x11;

                    // draw BLACK in the border
                    let offset = this.bitmapY;
                    offset = offset * 1024 + this.bitmapX;
                    if ((mode & 0x10) === 0)
                        // MODE_AG - bit 4; 0x10 is the AG bit
                        this.blitChar(this.video.fb32, 0x20, offset, this.pixelsPerChar, css);
                    else this.blitPixels(this.video.fb32, dat, offset, css);
                }

                this.addr = (this.addr + 1) & 0x1fff;
            }

            // end of horizontal line
            if (this.horizCounter === vdglinetime) {
                var completedCharVertical = this.scanlineCounter === this.charLinesreg9; // regs9  - scanlines per char    // 9	Maximum Raster Address

                //keep drawing same memory addresses until end of scanlines
                if (completedCharVertical) {
                    this.lineStartAddr = this.nextLineStartAddr;
                }

                this.scanlineCounter += 1;

                if (completedCharVertical) {
                    // this.hadVSyncThisRow = false;
                    this.scanlineCounter = 0;
                }

                // end of vertical frame was detected
                if (this.vertCounter >= vdgframelines) {
                    this.vertCounter = 0;
                } else {
                    this.vertCounter = (this.vertCounter + 1) & 0x1ff;
                }

                // start new horizontal line
                this.horizCounter = 0;
            } else {
                this.horizCounter = (this.horizCounter + 1) & 0xff;
            }

            if (this.vertCounter === vdgframelines) {
                this.frameCount++;
            }

            // // dump some data to CSV
            // var a = this.cpu.cycleSeconds*1000000.0+this.cpu.currentCycles;
            // var b = this.horizCounter;
            // var c = this.vertCounter;
            // var d = this.inVSync;
            // var e = css;

            // //using template literals for strings substitution
            // if (this.cpu.cycleSeconds==10 && this.cpu.currentCycles<60000 && this.horizCounter == 0)
            // {
            //     $("#csv_output").append(
            //         `<br>${a},${b},${c},${d},${e}`);
            // }
        } // matches while
    };

    this.blitPixels = function (buf, data, destOffset, css) {
        // var scanline = this.scanlineCounterT;
        // bitpattern from data is either 4 or 8 pixels in raw graphics
        // either white and black
        // or 3 colours and black (in pairs of bits)
        // that is: all graphics modes are 1bpp or 2bpp giving 2 colours or 4 colours

        var bitdef = data;
        var bpp = this.bpp;
        var pixelsPerBit = this.pixelsPerBit / bpp;
        var colour = 0xffffffff; //white  - see 'collook'  // alpha, blue, green, red

        // MODE NEED TO CHANGE THE RASTER SCAN
        // currently 32 x 16 - 256 x 192 (with 12 lines per row)

        // can get wide with 16 pixels

        destOffset |= 0;
        var fb32 = buf;
        var i = 0;

        var numPixels = 8 * pixelsPerBit; //per char
        // draw two,four pixels for each bit in the data to fill the width.

        for (i = 0; i < numPixels; i++) {
            var n = numPixels - 1 - i; // pixels in reverse order

            // get bits in pairs or singles
            var j = Math.floor(i / pixelsPerBit);

            // { 0,  0,  0  }, /*Black 0*/
            // { 0,  63, 0  }, /*Green 1*/
            // { 63, 63, 0  }, /*Yellow 2*/
            // { 0,  0,  63 }, /*Blue 3 */
            // { 63, 0,  0  }, /*Red 4 */
            // { 63, 63, 63 }, /*Buff 5*/
            // { 0,  63, 63 }, /*Cyan 6*/
            // { 63, 0,  63 }, /*Magenta 7*/
            // { 63, 32,  0  }, /*Orange 8 - actually red on the Atom*/

            // get just one bit
            // RG modes
            if (bpp === 1) {
                // get a bit
                let cval = (bitdef >>> j) & 0x1;
                // - green / buff  & black
                colour = cval !== 0 ? this.collook[css | 1] : this.collook[0];

                // two bitmap lines per 1 pixel
                fb32[destOffset + n + 1024] = fb32[destOffset + n] = colour;
            } // CG modes
            else {
                //let cval = (bitdef>>>(j&0xe))&0x3;
                let cval = (bitdef >>> (j & 0xe)) & 0x3;

                // 2 or 4 - green/yellow/blue/red
                let colindex = 1 + (cval | (css << 1));
                colour = this.collook[colindex];

                // two bitmap lines per 1 pixel
                fb32[destOffset + n + 1024] = fb32[destOffset + n] = colour;
            }
        }
    };

    this.blitChar = function (buf, data, destOffset, numPixels, css) {
        var scanline = this.scanlineCounter;
        var chr = data & 0x7f;

        // character set is just the pixel data
        // 0 - 63 is alphachars green  (0x00-0x3f) bits 0-5 for character
        // 64-127 is alphagraphics green/yellow/blue/red (0x40-0x7f) bit 6,7  (0xC0)
        // bit 7 set is inverted and the alphagraphics again
        // 128 - 191 is alphachars inverted green (0x80-0xbf)
        // 192-255 is alphagraphics again buff/cyan/magenta/orange (0xc0-0xff) bit 6,7 set (0xC0)

        // in the data; bits 0-5 are the pixels
        // bit 7 and CSS give the colour
        // bit 6 indicates TEXT or GRAPHICS
        // thus green and blue (css=0) alphagraphics cannot be accessed
        // and  buff and magenta (css=1) alphagraphics cannot be accessed
        // bits 7,6
        // [00] green text (or orange)
        // [01] yellow graphics (or cyan)
        // [10] inv green text (or inv orange)
        // [11] red graphics (or orange)

        // invert the char if bit 7 is set
        var inv = !!(data & 0x80);
        // graphics if bit 6 is set
        var agmode = !!(data & 0x40);

        //bitpattern for chars is in rows; each char is 12 rows deep
        var chardef = this.curGlyphs[chr * 12 + scanline];

        if (inv && !agmode) chardef = ~chardef;

        numPixels |= 0;
        numPixels *= this.bitmapPxPerPixel;

        // can get wide with 16 pixels
        var pixelsPerBit = numPixels / 8;

        destOffset |= 0;
        var fb32 = buf;
        var i = 0;
        for (i = 0; i < numPixels; ++i) {
            var n = numPixels - 1 - i; // pixels in reverse order
            var j = i / pixelsPerBit;
            // text is either green/black or orange/black - nothing else
            // css is 2 or 0 on input
            var fgcol = this.collook[css ? 8 : 1];

            if (agmode) {
                // alphagraphics 6
                // inv css | colour
                // 0 0 | yellow (2)   10   +   0000
                // 1 0 | red (4)      10   +   0010
                // 0 2 | cyan (6)     10   +   0100
                // 1 2 | orange (8)   10   +   0110
                // css is 2 or 0 on input
                fgcol = this.collook[2 + ((inv | css) << 1)];
            }

            var luminance = (chardef >>> j) & 0x1;
            var colour = luminance ? fgcol : this.collook[0];
            fb32[destOffset + n] = fb32[destOffset + n + 1024] = // two lines
                colour;
        }
    };

    this.reset(null);

    this.clearPaintBuffer();
    this.paint();
}

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
