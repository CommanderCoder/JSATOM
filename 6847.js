define(['./6847_fontdata', './utils'], function (fontData, utils) {
    "use strict";

    const VDISPENABLE = 1 << 0,
        HDISPENABLE = 1 << 1,
        FRAMESKIPENABLE = 1 << 5,
        EVERYTHINGENABLED = VDISPENABLE | HDISPENABLE | FRAMESKIPENABLE
        ;

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


    const MODE_AG = 0x80,
        MODE_GM2  = 0x40,
        MODE_GM1  = 0x20,
        MODE_GM0  = 0x10;

    function Video6847(video) {
        this.video = video;
        this.levelDEW = false;
        this.levelDISPTMG = false;

        // 8 colours (alpha on MSB)
        //
        this.collook = utils.makeFast32(new Uint32Array([
            0xff000000, 0xff00ff00, 0xff00ffff, 0xffff0000,
            0xff0000ff, 0xffffffff, 0xffffff00, 0xffff00ff,
            0xff0080ff]));
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
        this.oddClock = false;
        this.frameCount = 0;
        this.firstScanline = true;
        this.inHSync = false;
        this.inVSync = false;
        this.hadVSyncThisRow = false;

        this.checkVertAdjust = false;
        this.endOfMainLatched = false;
        this.endOfVertAdjustLatched = false;
        this.endOfFrameLatched = false;
        this.inVertAdjust = false;
        this.inDummyRaster = false;
        this.hpulseWidth = 0;
        this.vpulseWidth = 0;
        this.hpulseCounter = 0;
        this.vpulseCounter = 0;
        this.dispEnabled = 0;
        this.horizCounter = 0;
        this.vertCounter = 0;
        this.scanlineCounter = 0;
        this.vertAdjustCounter = 0;
        this.addr = 0;
        this.lineStartAddr = 0;
        this.nextLineStartAddr = 0;

        this.pixelsPerChar = 8;
        this.halfClock = false;
        this.interlacedSyncAndVideo = false;
        this.doubledScanlines = true;
        this.frameSkipCount = 0;

        this.bitmapPxPerPixel = 2;  // each pixel is 2 bitmap pixels wide and high
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
        }

        this.clearPaintBuffer = function() {
            this.video.interlacedSyncAndVideo = this.interlacedSyncAndVideo;
            this.video.doubledScanlines = this.doubledScanlines;
            this.video.frameCount = this.frameCount;
            this.video.bitmapX = this.bitmapX;
            this.video.bitmapY = this.bitmapY;
            this.video.clearPaintBuffer();
        }
        // END


        this.paintAndClear = function() {
            this.paint();
            this.clearPaintBuffer();

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

        this.endOfFrame = function () {
            this.vertCounter = 0;
            this.nextLineStartAddr = 0;
            this.lineStartAddr = this.nextLineStartAddr;
            this.dispEnableSet(VDISPENABLE);
        };

        this.endofCharacterLine = function () {
            this.vertCounter = (this.vertCounter + 1) & 0x1ff;
            this.scanlineCounter = 0;
        };

        this.endofScanline = function() {
            this.vpulseCounter = (this.vpulseCounter + 1) & 0x0F;

            // done the whole scanline
            var completedCharVertical = (this.scanlineCounter === this.charLinesreg9);  // regs9  - scanlines per char    // 9	Maximum Raster Address

            if (completedCharVertical) {
                this.lineStartAddr = this.nextLineStartAddr;
            }

            this.scanlineCounter = (this.scanlineCounter + 1) & 0x1f;

            // Reset scanline if necessary.
            if (completedCharVertical) {
                this.endofCharacterLine();
            }

            if (this.endOfMainLatched) {
                this.endOfMainLatched = false;

                this.endofCharacterLine();
                this.endOfFrame();
            }

            this.addr = this.lineStartAddr;
        };

        this.handleHSync = function()
        {
            this.hpulseCounter = (this.hpulseCounter + 1) & 0x0F;

            var movingToNextScanline = (this.hpulseCounter === (this.hpulseWidth>>>1));
            var atNextScanLine = (this.hpulseCounter === this.hpulseWidth);

            if (movingToNextScanline)
            {
                // Start at -ve pos because new character is added before the pixel render.
                this.bitmapX = -this.pixelsPerChar*this.bitmapPxPerPixel;

                this.bitmapY += this.bitmapPxPerPixel;

                if (this.bitmapY >= 768) {
                    // Arbitrary moment when TV will give up and start flyback in the absence of an explicit VSync signal
                    this.paintAndClear();
                }
            }
            else if (atNextScanLine)
            {
                this.inHSync = false;
            }
        };

        this.setValuesFromMode = function(mode) {

            mode = mode & 0xf0;

            var modes = {
                //chars,hsync,total,perchar    body,pos,total,  pixpb,lines, bpp
                0xf0: [32,44,64,8,  192,224,288,  1, 1, 1], //clear4  256x192x2,  pixels 1w1h   MAIN MENU
                0xb0: [16,21,32,16,  192,224,288,  2, 1, 1], //clear3  128x192x2, pixels  2w1h   BABIES
                0x70: [16,21,32,16,  96,128,160,  2, 2, 1], //clear2  128x96x2, pixels  2w2h  3D ASTEROIDS
                0x30: [16,13,24,16,  64,80,96,  2, 3, 1], //clear1   128x64x2 , pixels  3w4h (2w4h) 3D MAZE
                0xd0: [32,44,64,8,  192,224,288,  2, 1, 2], //?#B000=#d0  128x192x4,pixels  2w1h CHUCKIE EGG
                0x90: [32,44,64,8,  96,128,160,  2, 2, 2],//?#B000=#90  128x96x4, pixels 2w2h  FLAPPY BIRD
                0x50: [16,21,32,16, 64,80,96,  4, 3, 2],//?#B000=#50  128x64x4 , pixels 3w3h (4w3h) <none found>
                0x10: [8,9,15,32,  64,80,96,  8, 3, 2],//?#B000=#10  64x64x4 , pixels 4w3h  <none found>
                0x00: [32,44,64,8,  16,16,20,  0, 12, 2]  // clear0 //0,0 not used on Mode 0 (uses blitChar), pixelsPerBit, bpp
            };
            // DEFAULT to RG6 - 4 : resolution mode

            // reg3	Horizontal and Vertical Sync Widths - not really used
            this.vpulseWidth = 2; // clock cycles to go vertically
            this.hpulseWidth = 4; // clock cycles to go horizontally

            this.charsPerRowreg1 = modes[mode][0]; // 32 *
            this.startHsyncreg2 = modes[mode][1];  // 32*8 = 256 (start of hsync
            this.horizTotalreg0 = modes[mode][2]; // 64*8 = 512 (total width of canvas 2x2 canvas pixel per pixel)
            this.pixelsPerChar = modes[mode][3]; // 8 pixels per element

            this.vertBodyreg6 = modes[mode][4];//topBorder+rowsPerScreen; // end of main body for FRAME COUNTER: 24 - 192
            this.vertPosreg7 = modes[mode][5];//topBorder+rowsPerScreen+bottomBorder-1; // character end of bottom border START OF VSYNC  : 24 - 192 - 24
            this.vertTotalreg4 = modes[mode][6];  // end of bottom border : 24 + 192 + 24 (12+96+12)

            this.pixelsPerBit = this.bitmapPxPerPixel*modes[mode][7];
            var linesPerRow = modes[mode][8]; // move to reg9
            this.bpp = modes[mode][9];

            this.charLinesreg9 = linesPerRow-1;//2  - scanlines per char


        };


        // ATOM uses 6847 chip
        this.polltime = function (clocks) {
            // this is 256 pixels wide by 192 pixels high
            // the canvas bitmap is 1024 x 625 (for BBC micro)
            // so each atom pixel is two bitmap pixels using 512x384
            // border left and right is 256-256
            // border top and bottom is 120-121

            //  video mode
            var mode = (this.ppia.portapins & 0xf0);
            var css = (this.ppia.portcpins & 0x08)>>>2;

            // mode = 0x50;
            this.setValuesFromMode(mode);


            // scanline is a line within a characgter (or element, 1line, 2 lines, 3lines or 12 lines)
            // vertCounter is a character line (16)

            // horizCounter is a character (8,16,32) on a line  (total row including border is 64)
            // character is 8,4,2 pixels wide (depending on bpp)

            // each clock advances the raster by 16 bitmap pixels
            while (clocks--) {

                this.bitmapX += this.pixelsPerChar*this.bitmapPxPerPixel;

                // Handle HSync
                if (this.inHSync)
                    this.handleHSync();

                // Latch next line screen address in case we are in the last line of a character row
                if (this.horizCounter === this.charsPerRowreg1)  // regs1  32 Horizontal Displayed
                    this.nextLineStartAddr = this.addr;

                // Handle end of horizontal displayed.
                // Also, the last scanline character never displays.
                if ((this.horizCounter === this.charsPerRowreg1 ) ||  // regs1  32 Horizontal Displayed
                    (this.horizCounter === this.horizTotalreg0 )) {  // regs0  64 Horizontal Total
                    this.dispEnableClear(HDISPENABLE);
                }

                // Initiate HSync.
                // got to 32 characters
                if (this.horizCounter === this.startHsyncreg2 && !this.inHSync) {
                    this.inHSync = true;
                    this.hpulseCounter = 0;
                }

                var vSyncEnding = false;
                var vSyncStarting = false;
                if (this.inVSync &&
                    this.vpulseCounter === this.vpulseWidth) {  // vpulseWidth
                    vSyncEnding = true;
                    this.inVSync = false;
                }

                if (this.vertCounter === this.vertPosreg7 &&   // regs7	Vertical Sync position
                    !this.inVSync ) {
                    vSyncStarting = true;
                    this.inVSync = true;
                }

                if (vSyncStarting && !vSyncEnding) {
                    this.vpulseCounter = 0;
                    if (this.horizTotalreg0 && this.vertTotalreg4) {
                        this.paintAndClear();
                    }
                }

                if (vSyncStarting || vSyncEnding) {
                    // console.log(this.cpu.currentCycles + " : vert "+this.vertCounter+" :  "+this.inVSync);
                    this.ppia.setVBlankInt(this.inVSync);

                    // test with: FOR N=1 TO 10*60; WAIT; NEXT N
                    // should wait 10 seconds
                }

                // once the whole of the Vertical and Horizontal is complete then do this
                var insideBorder = (this.dispEnabled & (HDISPENABLE | VDISPENABLE)) === (HDISPENABLE | VDISPENABLE);
                if (insideBorder) {
                // if (true) {
                //     read from video memory - uses this.addr
                    var dat = this.readVideoMem();

                    //left column should be RED and right is GREEN
                    // visible bitmapY is 12 to 544 with a halfway at 266
                    // visible bitmapX is 64 to 960

                    var offset = this.bitmapY;
                    offset = (offset * 1024) + this.bitmapX;
                    // Render data depending on display enable state.
                    if (this.bitmapX >= 0 && this.bitmapX < 1024 && this.bitmapY < 625)
                    {
                        {
                                if ((mode & 0x10 ) == 0) // MODE_AG - bit 4; 0x10 is the AG bit
                                    // TODO: Add in the INTEXT modifiers to mode (if necessary)
                                    // blit into the fb32 buffer which is painted by VIDEO
                                    this.blitChar(this.video.fb32, dat, offset, this.pixelsPerChar, css);
                                else
                                    this.blitPixels(this.video.fb32, dat, offset, css);

                        }
                    }

                }
                else
                {
                    var offset = this.bitmapY;
                    offset = (offset * 1024) + this.bitmapX;
                    this.blitPixels(this.video.fb32, 0x00, offset, css);
                }

                // CRTC MA always increments, inside display border or not.
                // maximum 8k on ATOM
                this.addr = (this.addr + 1) & 0x1fff;


                // first character in and got to 16th line and list line of the scan line
                // done the main body
                // vertcounter is based on vertical height of an element
                if (this.horizCounter === 1) {
                    if (this.vertCounter === this.vertTotalreg4 &&  // end of vertical  // regs4	Vertical Total
                        this.scanlineCounter === this.charLinesreg9) {  // end of last scanline on vertical too  // regs9  - scanlines per char
                        this.endOfMainLatched = true;
                    }
                }

                // 16 bitmap pixels per char (64 * 16 = 1024)
                if (this.horizCounter === this.horizTotalreg0) {  // regs0	Horizontal Total
                    this.endofScanline();  // update this.addr in here from this.lineStartAddr
                    this.horizCounter = 0;
                    this.dispEnableSet(HDISPENABLE);
                } else {
                    this.horizCounter = (this.horizCounter + 1) & 0xff;
                }

                // regs6	Vertical Displayed
                if (this.vertCounter === this.vertBodyreg6 &&
                    (this.dispEnabled & VDISPENABLE)) {
                    this.dispEnableClear(VDISPENABLE);
                    this.frameCount++;
                }

            } // matches while

        };


        this.blitPixels = function ( buf, data, destOffset, css)
        {
            var scanline = this.scanlineCounterT;
            // bitpattern from data is either 4 or 8 pixels in raw graphics
            // either white and black
            // or 3 colours and black (in pairs of bits)
            // that is: all graphics modes are 1bpp or 2bpp giving 2 colours or 4 colours

            var bitdef = data;
            var bpp = this.bpp;
            var pixelsPerBit = this.pixelsPerBit/bpp;
            var colour = 0xffffffff; //white  - see 'collook'  // alpha, blue, green, red


    // MODE NEED TO CHANGE THE RASTER SCAN
            // currently 32 x 16 - 256 x 192 (with 12 lines per row)

            // can get wide with 16 pixels

            destOffset |= 0;
            var fb32 = buf;
            var i = 0;


            var numPixels = 8*pixelsPerBit;  //per char
            // draw two,four pixels for each bit in the data to fill the width.

            for (i = 0; i < numPixels; i++) {
                var n = (numPixels) - 1 - i; // pixels in reverse order

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
                if (bpp == 1) {
                    // get a bit
                    var cval = (bitdef>>>j)&0x1;
                    // - green / buff  & black
                    colour = (cval!=0) ? this.collook[(css | 1)] : this.collook[0];


                    // two bitmap lines per 1 pixel
                    fb32[destOffset + n + 1024] = fb32[destOffset + n] = colour;

                }
                else // CG modes
                {
                    //var cval = (bitdef>>>(j&0xe))&0x3;
                    var cval = (bitdef>>>(j&0xe))&0x3;

                    // 2 or 4 - green/yellow/blue/red
                    var colindex = 1+(cval | (css<<1));
                    colour = this.collook[colindex];

                    // two bitmap lines per 1 pixel
                    fb32[destOffset + n + 1024] = fb32[destOffset + n] = colour;
                }

            }


        };



        this.blitChar = function ( buf, data, destOffset, numPixels, css)
        {
            var scanline = this.scanlineCounter;
            var chr = data&0x7f;

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
            var chardef = this.curGlyphs[chr  * 12 + scanline];

            if (inv && !agmode)
                chardef = ~chardef;

            numPixels |= 0;
            numPixels *= this.bitmapPxPerPixel;

            // can get wide with 16 pixels
            var pixelsPerBit = numPixels/8;

            destOffset |= 0;
            var fb32 = buf;
            var i = 0;
            for (i = 0; i < numPixels; ++i) {
                var n = numPixels - 1 - i; // pixels in reverse order
                var j = i / pixelsPerBit;
                // text is either green/black or orange/black - nothing else
                // css is 2 or 0 on input
                var fgcol = this.collook[(!!css)?8:1];

                if (agmode) // alphagraphics 6
                {
                    // inv css | colour
                    // 0 0 | yellow (2)   10   +   0000
                    // 1 0 | red (4)      10   +   0010
                    // 0 2 | cyan (6)     10   +   0100
                    // 1 2 | orange (8)   10   +   0110
                    // css is 2 or 0 on input
                    fgcol = this.collook[2+((inv | css)<<1)];
                }

                var luminance = (chardef>>>j)&0x1;
                var colour = luminance?fgcol:this.collook[0];
                fb32[destOffset + n] =
                    fb32[destOffset + n + 1024 ] =  // two lines
                        colour;
            }

        };

        this.reset(null);

        this.clearPaintBuffer();
        this.paint();
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
