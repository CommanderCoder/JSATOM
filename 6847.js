define(['./6847_fontdata', './utils'], function (fontData, utils) {
    "use strict";

    const VDISPENABLE = 1 << 0,
        HDISPENABLE = 1 << 1,
        // SKEWDISPENABLE = 1 << 2,
        // SCANLINEDISPENABLE = 1 << 3,
        // USERDISPENABLE = 1 << 4,
        FRAMESKIPENABLE = 1 << 5,
        // EVERYTHINGENABLED = VDISPENABLE | HDISPENABLE | SKEWDISPENABLE | SCANLINEDISPENABLE | USERDISPENABLE | FRAMESKIPENABLE,
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

        this.reset = function (cpu, ppia, hard) {
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

        this.paintAndClearOLD = function() {
            if (this.dispEnabled & FRAMESKIPENABLE) {
                this.paint();
                this.clearPaintBuffer();
            }
            this.dispEnabled &= ~FRAMESKIPENABLE;
            var enable = FRAMESKIPENABLE;
            if (this.frameSkipCount > 1) {
                if (this.frameCount % this.frameSkipCount) enable = 0;
            }
            this.dispEnabled |= enable;

            this.bitmapY = 0;
            // // Interlace even frame fires vsync midway through a scanline.
            // if (!!(this.regs[8] & 1) && !!(this.frameCount & 1)) {
            //     this.bitmapY = -1;
            // }
        };

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

        // reset vertcounter, firstscanline, nextLineStartAddr and lineStartAddr
        // enable VIDSP,
        this.endOfFrameOLD = function () {
            this.vertCounter = 0;
            this.firstScanline = true;
            this.nextLineStartAddr = 0;
            this.lineStartAddr = this.nextLineStartAddr;
            this.dispEnableSet(VDISPENABLE);
        };

        // reset scanlinecounter, hadVsync this row
        // increment vertcounter (max 127 or 255)
        this.endofCharacterLineOLD = function () {
            this.vertCounter = (this.vertCounter + 1) ;//& 0x7f;

            this.scanlineCounter = 0;
            this.hadVSyncThisRow = false;
            // this.dispEnableSet(SCANLINEDISPENABLE);
        };

        // reset firstScanline
        // increment vpulscounter (max 15)
        // linestart = nextlinestart when scanline = regs9
        // increment scanline (max 31)
        // not in vertadjust and hitr9 then reset scanline
        // endofMain and !endofvertadj then set invertadjust
        // if endofframe or endfovertadj then reset all
        // set next line
        this.endofScanlineOLD = function() {
            this.firstScanline = false;

            this.vpulseCounter = (this.vpulseCounter + 1) & 0x0F;

            // Pre-counter increment compares and logic.
            var r9Hit = (this.scanlineCounter === this.regs[9]);  // regs9  - scanlines per char    // 9	Maximum Raster Address

            if (r9Hit) {
                // An R9 hit always loads a new character row address, even if
                // we're in vertical adjust!
                // Note that an R9 hit inside vertical adjust does not further
                // increment the vertical counter, but entry into vertical
                // adjust does.
                this.lineStartAddr = this.nextLineStartAddr;
            }

            this.scanlineCounter = (this.scanlineCounter + 1) & 0x1f;

            // Reset scanline if necessary.
            if (!this.inVertAdjust && r9Hit) {
                this.endofCharacterLine();
            }

            if (this.endOfMainLatched && !this.endOfVertAdjustLatched) {
                this.inVertAdjust = true;
            }

            var endOfFrame = false;

            if (this.endOfFrameLatched) {
                endOfFrame = true;
            }

            if (this.endOfVertAdjustLatched) {
                this.inVertAdjust = false;
                // The "dummy raster" is inserted at the very end of frame,
                // after vertical adjust, for even interlace frames.
                // Testing indicates interlace is checked here, a clock before
                // it is entered or not.
                // Like vertical adjust, C4=R4+1.
                endOfFrame = true;
            }

            // reset everything
            if (endOfFrame) {
                this.endOfMainLatched = false;
                this.endOfVertAdjustLatched = false;
                this.endOfFrameLatched = false;
                this.inDummyRaster = false;

                this.endofCharacterLine();
                this.endOfFrame();
            }

            this.addr = this.lineStartAddr;
        };

        // set sync widths
        // increment horiz pulse counter (max 15)
        // if horiz pulse counter == half hpulsewidth
        //   reset bitmapx , incr bitmapy
        // otherwise if hpulsecounter == hpulsewidth
        //   reset inHSync
        this.handleHSyncOLD = function () {
            this.hpulseWidth = this.regs[3]&0xf;  // regs3 syncwidths (horiz)
            this.vpulseWidth = (this.regs[3]&0xf0)>>>4;  // regs3 syncwidths (vert)

            this.hpulseCounter = (this.hpulseCounter + 1) & 0x0F;
            if (this.hpulseCounter === (this.hpulseWidth >>> 1)) { //0x4 - hpulsewidth
                // Start at -8 because the +8 is added before the pixel render.

                this.bitmapX = -8;

                // Half-clock horizontal movement
                if (this.hpulseWidth & 1) {  //0x4 - hpulsewidth
                    this.bitmapX -= 4;
                }

                // The CRT vertical beam speed is constant, so this is actually
                // an approximation that works if hsyncs are spaced evenly.
                this.bitmapY += 2;

                // If no VSync occurs this frame, go back to the top and force a repaint
                if (this.bitmapY >= 768) {
                    // Arbitrary moment when TV will give up and start flyback in the absence of an explicit VSync signal
                    this.paintAndClear();
                }
            }
            else if (this.hpulseCounter === (this.regs[3] & 0x0F)) { //regs[3]  -  0x24  (VERT and HORIZ - 4 bit each)
                this.inHSync = false;
            }
        };

        // this.dispEnableChanged = function() {
        //     // The DISPTMG output pin is wired to the SAA5050 teletext chip,
        //     // for scanline tracking, so keep it apprised.
        //     var mask = (HDISPENABLE | VDISPENABLE | USERDISPENABLE);
        //     var disptmg = ((this.dispEnabled & mask) === mask);
        //     this.setDISPTMG(disptmg);
        // };


        this.dispEnableSet = function (flag) {
            this.dispEnabled |= flag;
            // this.dispEnableChanged();
        };

        this.dispEnableClear = function (flag) {
            this.dispEnabled &= ~flag;
            // this.dispEnableChanged();
        };

        this.endOfFrame = function () {
            this.vertCounter = 0;
            this.dispEnableSet(VDISPENABLE);
        };

        this.endofCharacterLine = function () {
            this.vertCounter = (this.vertCounter + 1);// & 0x7f;
            this.scanlineCounter = 0;
        };

        this.endofScanline = function() {
            this.vpulseCounter = (this.vpulseCounter + 1) & 0x0F;

            // done the whole scanline
            var completedCharVertical = (this.scanlineCounter === this.charLinesreg9);  // regs9  - scanlines per char    // 9	Maximum Raster Address

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
            if (mode == 0x10)  //1a - 4 colour mode
            {
            }
            else if (mode == 0x50) //2a - 4 colour mode
            {
                this.pixelsPerBit = this.bitmapPxPerPixel;
                this.bpp = 2;

            }
            else if (mode == 0x90) //3a - 4 colour mode
            {
                this.pixelsPerBit = this.bitmapPxPerPixel;
                this.bpp = 2;
            }
            else if (mode == 0xd0) //4a - 4 colour mode
            {
                this.pixelsPerBit = this.bitmapPxPerPixel;
                this.bpp = 2;
            }

            if (mode == 0xf0)  // RG4  - resolution mode
            {
                // 256 wide  - see reg1 * 8
                // 192 LINES  - see reg4

                var linesPerRow = 1;
                var topBorder  = 24/linesPerRow; // 8 chars high
                var bottomBorder  = 24/linesPerRow; // 8 chars high
                var rowsPerScreen = 192/linesPerRow; // 64 chars high

                // reg3	Horizontal and Vertical Sync Widths
                this.vpulseWidth = 2; // clock cycles to go vertically
                this.hpulseWidth = 4; // clock cycles to go horizontally

                this.charsPerRowreg1 = 32; // 32 *
                this.startHsyncreg2 = 33; // 32*8 = 256 (start of hsync
                this.horizTotalreg0 = 64; // 64*8 = 512 (total width of canvas 2x2 canvas pixel per pixel)
                this.pixelsPerChar = 8; // 8 pixels per element

                this.vertBodyreg6 = 192;//topBorder+rowsPerScreen; // end of main body for FRAME COUNTER: 24 - 192
                this.vertPosreg7 = 243;//topBorder+rowsPerScreen+bottomBorder-1; // character end of bottom border START OF VSYNC  : 24 - 192 - 24
                this.vertTotalreg4 = 305;  // end of bottom border : 24 + 192 + 24 (12+96+12)

                this.charLinesreg9 = linesPerRow-1;//2  - scanlines per char

                this.pixelsPerBit = this.bitmapPxPerPixel;
                this.bpp = 1;

            } else if (mode == 0xb0) //RG3 resolution mode
            {
                // 128 wide
                // 192 LINES // 6	Vertical Displayed

                var linesPerRow = 2;
                var linesPerChar = 12; // 12 vertical lines per char in mode 0
                var rowsPerScreen = 16; // 16 chars high
                // reg3	Horizontal and Vertical Sync Widths
                this.vpulseWidth = 2; // clock cycles to go vertically
                this.hpulseWidth = 4; // clock cycles to go horizontally

                // RG3 decreases reg1 and increases pixelsPerChar
                this.charsPerRowreg1 = 16; // 16 x2 bytes (256 bits)
                this.startHsyncreg2 = 16;
                this.horizTotalreg0 = 32; // 16*32 = 512
                this.pixelsPerChar = 16; // 16 pixels per element (wide

                this.vertBodyreg6 = 98;//topBorder+rowsPerScreen; // end of main body for FRAME COUNTER: 24 - 192
                this.vertPosreg7 = 99;//topBorder+rowsPerScreen+bottomBorder-1; // character end of bottom border START OF VSYNC  : 24 - 192 - 24
                this.vertTotalreg4 = 152;  // end of bottom border : 24 + 192 + 24 (12+96+12)
                this.charLinesreg9 = linesPerRow-1;//2  - scanlines per char

                this.pixelsPerBit = this.bitmapPxPerPixel*2;
                this.bpp = 1;

            } else if (mode == 0x70) // RG2
            {
                // this mode has to fill 384 lines (4*96)
                // since bitmapPxPerPixel ia 2 , there needs to be 2 rows
                // using charLinesreg9

                // reg9 is 1 (i.e 2 lines)
                // need 192 lines so thats 96 rows  :
                // need 24 lines at the top (12 rows)
                // need 24 lines at the bottom (12 rows)
                // use these for reg4,6,7

                // 128 wide
                // 96 LINES // 6	Vertical Displayed

                // RG2 increases linesPerRow but doesn't do anything else
                var linesPerRow = 2;
                var linesPerChar = 12; // 12 vertical lines per char in mode 0
                var topBorder  = 24/linesPerRow; // 24 chars high
                var bottomBorder  = 24/linesPerRow; // 24 chars high
                var rowsPerScreen = 192/linesPerRow; // 96 chars high
                this.vpulseWidth = 2; // clock cycles to go vertically
                this.hpulseWidth = 4; // clock cycles to go horizontally

                this.charsPerRowreg1 = 16; // 16 x2 bytes (256 bits)
                this.startHsyncreg2 = 16;
                this.horizTotalreg0 = 32; // 16*32 = 512
                this.pixelsPerChar = 16; // 16 pixels per element (wide

                this.vertBodyreg6 = 98;//topBorder+rowsPerScreen; // end of main body for FRAME COUNTER: 24 - 192
                this.vertPosreg7 = 99;//topBorder+rowsPerScreen+bottomBorder-1; // character end of bottom border START OF VSYNC  : 24 - 192 - 24
                this.vertTotalreg4 = 152;  // end of bottom border : 24 + 192 + 24 (12+96+12)

                this.charLinesreg9 = linesPerRow-1;//2  - scanlines per char

                this.pixelsPerBit = this.bitmapPxPerPixel*2;
                this.bpp = 1;

            } else if (mode == 0x30) // RG1
            {
                // this mode has to fill 384 lines (4*96)
                // since bitmapPxPerPixel ia 2 , there needs to be 2 rows
                // using charLinesreg9

                // reg9 is 1 (i.e 3 lines)
                // need 192 lines so thats 64 rows  :
                // need 24 lines at the top (8 rows)
                // need 24 lines at the bottom (8 rows)
                // use these for reg4,6,7

                // 128 wide
                // 96 LINES // 6	Vertical Displayed
                // RG1 increases linesPerRow but doesn't do anything else
                var linesPerRow = 3;
                var linesPerChar = 12; // 12 vertical lines per char in mode 0
                var topBorder = 24 / linesPerRow; // 24 chars high
                var bottomBorder = 24 / linesPerRow; // 24 chars high
                var rowsPerScreen = 192 / linesPerRow; // 96 chars high
                this.vpulseWidth = 2; // clock cycles to go vertically
                this.hpulseWidth = 4; // clock cycles to go horizontally

                this.charsPerRowreg1 = 16; // 16 x2 bytes (256 bits)
                this.startHsyncreg2 = 16;
                this.horizTotalreg0 = 32; // 16*32 = 512
                this.pixelsPerChar = 16; // 16 pixels per element (wide

                this.vertBodyreg6 = 98;//topBorder+rowsPerScreen; // end of main body for FRAME COUNTER: 24 - 192
                this.vertPosreg7 = 99;//topBorder+rowsPerScreen+bottomBorder-1; // character end of bottom border START OF VSYNC  : 24 - 192 - 24
                this.vertTotalreg4 = 101;  // end of bottom border : 24 + 192 + 24 (12+96+12)

                this.charLinesreg9 = linesPerRow - 1;//2  - scanlines per char

                this.pixelsPerBit = this.bitmapPxPerPixel * 2;
                this.bpp = 1;
            } else if (mode == 0x10) // CG1
            {
                // increases pixelsperchar to 16
                // decreaes chars per row to 16
                // 8*32 =
                var linesPerRow = 3;
                var linesPerChar = 12; // 12 vertical lines per char in mode 0
                var topBorder = 24 / linesPerRow; // 24 chars high
                var bottomBorder = 24 / linesPerRow; // 24 chars high
                var rowsPerScreen = 192 / linesPerRow; // 96 chars high
                this.vpulseWidth = 2; // clock cycles to go vertically
                this.hpulseWidth = 4; // clock cycles to go horizontally

                this.charsPerRowreg1 = 16; // 16 x2 bytes (256 bits)
                this.startHsyncreg2 = 9;

                this.horizTotalreg0 = 32; // 16*32 = 512
                this.pixelsPerChar = 16; // 8 pixels normally (so 32pixels==4 'voxels' per char)

                // reg6 purple white
                // reg7 blue yellow
                // reg4 green yellow
                this.vertBodyreg6 = 64;//CORRECT
                this.vertPosreg7 = 89;//topBorder+rowsPerScreen+bottomBorder-1; // character end of bottom border START OF VSYNC  : 24 - 192 - 24
                this.vertTotalreg4 = 96;  // end of bottom border : 24 + 192 + 24 (12+96+12)

                this.charLinesreg9 = linesPerRow - 1;//2  - scanlines per char

                this.pixelsPerBit = this.bitmapPxPerPixel*2;
                this.bpp = 2;


                // } else if (mode == 0xd0) // 4a
            // {
            //     this.regs[9] = 0x0; //1  - scanlines per char
            //
            //     regs0 = 0x3f;            // 0	Horizontal Total
            //     regs1 = 0x20;   //32bpr  // 1	Horizontal Displayed
            //     regs2 = 0x2c;   //<<<<    // 2 	Horizontal Sync Position
            //
            //     regs4 = 0xe0;       // 4	Vertical Total
            //     regs5 = 0x1d; //<<<<<  // 5	Vertical Total Adjust
            //     regs6 = 0xc0; //192 LINES // 6	Vertical Displayed
            //     regs7 = 0xc0;  // 7	Vertical Sync position
            // } else if (mode == 0x90) //3a
            // {
            //     this.regs[9] = 0x1; //2  - scanlines per char
            //
            //     regs0 = 0x3f;            // 0	Horizontal Total
            //     regs1 = 0x20; //32bpr   // 1	Horizontal Displayed
            //     regs2 = 0x2c;   //<<<<    // 2	Horizontal Sync Position
            //
            //     regs4 = 0x70;//<<<<       // 4	Vertical Total
            //     regs5 = 0x1d; //<<<<<  // 5	Vertical Total Adjust
            //     regs6 = 0x60; // 96 LINES // 6	Vertical Displayed
            //     regs7 = 0x60;  // 7	Vertical Sync position
            // } else if (mode == 0x50) //2a
            // {
            //     this.regs[9] = 0x2; //3  - scanlines per char
            //
            //     regs0 = 0x40;            // 0	Horizontal Total
            //     regs1 = 0x20; //32bpr   // 1	Horizontal Displayed
            //     regs2 = 0x2d;   //<<<<    // 2	Horizontal Sync Position
            //
            //     regs4 = 0x50;//<<<<       // 4	Vertical Total
            //     regs5 = 0x07; //<<<<<  // 5	Vertical Total Adjust
            //     regs6 = 0x40; // 64 LINES // 6	Vertical Displayed
            //     regs7 = 0x4c;  // 7	Vertical Sync position
            // } else if (mode == 0x10) //1a
            // {
            //     this.regs[9] = 0x2; //3  - scanlines per char
            //     regs0 = 0x3f;            // 0	Horizontal Total
            //     regs1 = 0x10;   //16bpr  // 1	Horizontal Displayed
            //     regs2 = 0x35;   //<<<<    // 2	Horizontal Sync Position
            //     this.regs[3] = 0x24;
            //     this.pixelsPerChar = 32;  // for blitChar
            //     this.halfClock = true;
            //
            //     regs4 = 0x4a;//<<<<       // 4	Vertical Total
            //     regs5 = 0x1d; //<<<<<  // 5	Vertical Total Adjust
            //     regs6 = 0x40; // 64 LINES // 6	Vertical Displayed
            //     regs7 = 0x40;  // 7	Vertical Sync position
            // } else
            // {
            //     // for text mode 0
            //
            //     this.regs[9] = 0x0b; //13  - scanlines per char
            //     regs0 = 0x3f;            // 0	Horizontal Total
            //     regs1 = 0x20;   //32bpr  // 1	Horizontal Displayed
            //     regs2 = 0x2c;   //<<<<    // 2	Horizontal Sync Position
            //
            //     this.pixelsPerChar = 16;  // 16 for blitChar
            //     this.halfClock = false; //  for blitChar
            //
            //     regs4 = 0x14;//<<<<       // 4	Vertical Total
            //     //regs5 ; // offset from top of each scanline
            //     regs5 = 0x1d; //<<<<<  // 5	Vertical Total Adjust
            //     regs6 = 0x10; // 64 LINES // 6	Vertical Displayed
            //     regs7 = 0x12;  // 7	Vertical Sync position
            //
            //
            //     this.regs[3] = 0x24;  //2 HEIGHT... 4 WIDTH

            }
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

            mode = 0x10;
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
                    this.ppia.setVBlankInt(this.inVSync);
                }

                // once the whole of the Vertical and Horizontal is complete then do this
                var insideBorder = (this.dispEnabled & (HDISPENABLE | VDISPENABLE)) === (HDISPENABLE | VDISPENABLE);
                // if (insideBorder) {
                if (true) {
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
                        mode |= 0x8;  //add css
                        // if (this.bitmapY >= 12 && this.bitmapY <= 544)
                        //     mode &= ~0x8;  //add css
                        if (this.bitmapY <= 266)
                            mode &= ~0x8;  //add css

                        if (this.bitmapY <= 12)
                            this.blitPixels(this.video.fb32, 0x11, offset, mode);
                        if (this.bitmapY === 278) //halfway
                            this.blitPixels(this.video.fb32, 0xff, offset, mode);
                        if (this.bitmapY >= 544)
                            this.blitPixels(this.video.fb32, 0x11, offset, mode);

                        if (this.bitmapX <= 80)
                            this.blitPixels(this.video.fb32, 0xf2, offset, mode);
                        if (this.bitmapX === 512)  // halfway
                            this.blitPixels(this.video.fb32, 0xe4, offset, mode);
                        if (this.bitmapX >= 944)
                            this.blitPixels(this.video.fb32, 0x2f, offset, mode);

                        if (this.vertCounter === this.vertPosreg7)  // vsync starts
                            this.blitPixels(this.video.fb32, 0x73, offset, mode);
                        if (this.vertCounter === this.vertBodyreg6) // this is end of vdisp
                            this.blitPixels(this.video.fb32, 0x62, offset, mode);
                        if (this.vertCounter === this.vertTotalreg4) // this is start of vdisp
                            this.blitPixels(this.video.fb32, 0x51, offset, mode);

                        if (this.horizCounter === this.startHsyncreg2)  // vsync starts
                            this.blitPixels(this.video.fb32, 0xbb, offset, mode);
                        if (this.horizCounter === this.charsPerRowreg1) // this is end of vdisp
                            this.blitPixels(this.video.fb32, 0x22, offset, mode);
                        if (this.horizCounter === this.horizTotalreg0) // this is start of vdisp
                            this.blitPixels(this.video.fb32, 0xee, offset, mode);

                        if (insideBorder) {

                        this.blitPixels(this.video.fb32, this.vertCounter&0xff, offset, mode);
                        }
                    }

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

        }

            // ATOM uses 6847 chip
        this.polltimeOLD = function (clocks) {

            // this.dispEnableSet(USERDISPENABLE);

            // var regs0 = 0x40, regs1 = 0x20, regs2 = 0x22; // horizontals
            // var regs4 = 0x12; // vertical position
            // var regs5 = 0x03; // offset from top of each scanline
            // var regs6 = 0x10, regs7 = 0x10;
            // var regs9 = 0x0b;

            // for text mode 0
            this.pixelsPerChar = 16;  // 16 for blitChar
            this.halfClock = false; // true for blitChar


            // regs1  //32bpr
            var regs0 , regs1 , regs2 ; // horizontals
            this.regs[3] = 0x24;  //2 HEIGHT... 4 WIDTH

            var regs4 , regs5, regs6 , regs7 ;  // verticals

           //  regs9 // this is the number of LINES per character

            // // in mode 1111 this should be 1
            var mode = (this.ppia.portapins & 0xf0);
            if (mode == 0xf0)  // 4
            {
                this.regs[9] = 0x0; //1  - scanlines per char    // 9	Maximum Raster Address

                regs0 = 0x40;            // 0	Horizontal Total
                regs1 = 0x20; //32bpr   // 1	Horizontal Displayed
                regs2 = 0x2d;   //<<<<    // 2	Horizontal Sync Position
// 3	Horizontal and Vertical Sync Widths
                regs4 = 0xf0;       // 4	Vertical Total
                regs5 = 0x16; //<<<<<  // 5	Vertical Total Adjust
                regs6 = 0xc0; //192 LINES // 6	Vertical Displayed
                regs7 = 0xe6;  // 7	Vertical Sync position

                // want 256 pixels -

                this.pixelsPerChar = 8;
                this.halfClock = false;

            } else if (mode == 0xb0) //3
            {
                // this.regs[3] = 0x28;  //2 HEIGHT... 8 WIDTH

                // this.pixelsPerChar = 8;  // for blitChar
                this.halfClock = true;

                this.regs[9] = 0x0; //1  - scanlines per char

                regs0 = 0x40;            // 0	Horizontal Total
                regs1 = 0x10; //16bpr  // 1	Horizontal Displayed
                regs2 = 0x34;   //<<<<    // 2	Horizontal Sync Position

                regs4 = 0xf0;       // 4	Vertical Total
                regs5 = 0x16; //<<<<<  // 5	Vertical Total Adjust
                regs6 = 0xc0; //192 LINES // 6	Vertical Displayed
                regs7 = 0xe6;  // 7	Vertical Sync position

            } else if (mode == 0x70) //2
            {
                this.regs[9] = 0x1; //2  - scanlines per char

                regs0 = 0x33;
                regs1 = 0x10; //16bpr
                // regs2 = 0x29;
                this.regs[3] = 0x28;  //2 HEIGHT... 8 WIDTH


                this.pixelsPerChar = 8;  // for blitChar
                this.halfClock = true;

                regs0 = 0x3f;            // 0	Horizontal Total
                regs1 = 0x10;   //16bpr  // 1	Horizontal Displayed
                regs2 = 0x33;   //<<<<    // 2	Horizontal Sync Position

                regs4 = 0x70;//<<<<       // 4	Vertical Total
                regs5 = 0x1d; //<<<<<  // 5	Vertical Total Adjust
                regs6 = 0x60; // 96 LINES // 6	Vertical Displayed
                regs7 = 0x60;  // 7	Vertical Sync position

            } else if (mode == 0x30) //1
            {
                this.regs[9] = 0x2; //3  - scanlines per char
                // regs2 = 0x29;
                this.regs[3] = 0x28;  //2 HEIGHT... 8 WIDTH


                this.pixelsPerChar = 8;  // for blitChar
                this.halfClock = true;

                regs0 = 0x40;            // 0	Horizontal Total
                regs1 = 0x10;   //16bpr  // 1	Horizontal Displayed
                regs2 = 0x34;   //<<<<    // 2	Horizontal Sync Position

                regs4 = 0x50;//<<<<       // 4	Vertical Total
                regs5 = 0x07; //<<<<<  // 5	Vertical Total Adjust
                regs6 = 0x40; // 64 LINES // 6	Vertical Displayed
                regs7 = 0x4c;  // 7	Vertical Sync position
            } else if (mode == 0xd0) // 4a
            {
                this.regs[9] = 0x0; //1  - scanlines per char

                regs0 = 0x3f;            // 0	Horizontal Total
                regs1 = 0x20;   //32bpr  // 1	Horizontal Displayed
                regs2 = 0x2c;   //<<<<    // 2 	Horizontal Sync Position

                regs4 = 0xe0;       // 4	Vertical Total
                regs5 = 0x1d; //<<<<<  // 5	Vertical Total Adjust
                regs6 = 0xc0; //192 LINES // 6	Vertical Displayed
                regs7 = 0xc0;  // 7	Vertical Sync position
            } else if (mode == 0x90) //3a
            {
                this.regs[9] = 0x1; //2  - scanlines per char

                regs0 = 0x3f;            // 0	Horizontal Total
                regs1 = 0x20; //32bpr   // 1	Horizontal Displayed
                regs2 = 0x2c;   //<<<<    // 2	Horizontal Sync Position

                regs4 = 0x70;//<<<<       // 4	Vertical Total
                regs5 = 0x1d; //<<<<<  // 5	Vertical Total Adjust
                regs6 = 0x60; // 96 LINES // 6	Vertical Displayed
                regs7 = 0x60;  // 7	Vertical Sync position
            } else if (mode == 0x50) //2a
            {
                this.regs[9] = 0x2; //3  - scanlines per char

                regs0 = 0x40;            // 0	Horizontal Total
                regs1 = 0x20; //32bpr   // 1	Horizontal Displayed
                regs2 = 0x2d;   //<<<<    // 2	Horizontal Sync Position

                regs4 = 0x50;//<<<<       // 4	Vertical Total
                regs5 = 0x07; //<<<<<  // 5	Vertical Total Adjust
                regs6 = 0x40; // 64 LINES // 6	Vertical Displayed
                regs7 = 0x4c;  // 7	Vertical Sync position
            } else if (mode == 0x10) //1a
            {
                this.regs[9] = 0x2; //3  - scanlines per char
                regs0 = 0x3f;            // 0	Horizontal Total
                regs1 = 0x10;   //16bpr  // 1	Horizontal Displayed
                regs2 = 0x35;   //<<<<    // 2	Horizontal Sync Position
                this.regs[3] = 0x24;
                this.pixelsPerChar = 32;  // for blitChar
                this.halfClock = true;

                regs4 = 0x4a;//<<<<       // 4	Vertical Total
                regs5 = 0x1d; //<<<<<  // 5	Vertical Total Adjust
                regs6 = 0x40; // 64 LINES // 6	Vertical Displayed
                regs7 = 0x40;  // 7	Vertical Sync position
            } else
            {
                // for text mode 0

                this.regs[9] = 0x0b; //13  - scanlines per char
                regs0 = 0x3f;            // 0	Horizontal Total
                regs1 = 0x20;   //32bpr  // 1	Horizontal Displayed
                regs2 = 0x2c;   //<<<<    // 2	Horizontal Sync Position

                this.pixelsPerChar = 16;  // 16 for blitChar
                this.halfClock = false; //  for blitChar

                regs4 = 0x14;//<<<<       // 4	Vertical Total
                //regs5 ; // offset from top of each scanline
                regs5 = 0x1d; //<<<<<  // 5	Vertical Total Adjust
                regs6 = 0x10; // 64 LINES // 6	Vertical Displayed
                regs7 = 0x12;  // 7	Vertical Sync position


                this.regs[3] = 0x24;  //2 HEIGHT... 4 WIDTH

            }

            mode |= (this.ppia.portcpins & 0x08); // CSS value

            while (clocks--) {
                this.oddClock = !this.oddClock;
                // Advance CRT beam.
                this.bitmapX += 16;

                if (this.halfClock && !this.oddClock) {
                    continue;
                }


                // Handle HSync
                if (this.inHSync)
                    this.handleHSync();

                // Handle delayed display enable due to skew
                // if (this.horizCounter === 0) {
                //     this.dispEnableSet(SKEWDISPENABLE);
                // }

                // Latch next line screen address in case we are in the last line of a character row
                if (this.horizCounter === regs1)  // regs1  32 Horizontal Displayed
                    this.nextLineStartAddr = this.addr;

                // Handle end of horizontal displayed.
                // Also, the last scanline character never displays.
                if ((this.horizCounter === regs1 ) ||  // regs1  32 Horizontal Displayed
                    (this.horizCounter === regs0 )) {  // regs0  64 Horizontal Total
                    this.dispEnableClear(HDISPENABLE);// | SKEWDISPENABLE);
                }

                // Initiate HSync.
                if (this.horizCounter === regs2 && !this.inHSync) {  // regs2	Horizontal Sync Position
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
                if (this.vertCounter === regs7 &&   // regs7	Vertical Sync position
                    !this.inVSync &&
                    !this.hadVSyncThisRow ) {
                    vSyncStarting = true;
                    this.inVSync = true;
                }

                if (vSyncStarting && !vSyncEnding) {
                    this.hadVSyncThisRow = true;
                    this.vpulseCounter = 0;
                    this.paintAndClear();
                }

                if (vSyncStarting || vSyncEnding) {
                    this.ppia.setVBlankInt(this.inVSync);
                    // this.setDEW(this.inVSync);
                }

                // once the whole of the Vertical and Horizontal is complete then do this
                var insideBorder = (this.dispEnabled & (HDISPENABLE | VDISPENABLE)) === (HDISPENABLE | VDISPENABLE);
                // if (false)
                if (insideBorder)
                {
                    // read from video memory - uses this.addr
                    var dat = this.readVideoMem();

                    var offset = this.bitmapY;
                    offset = (offset * 1024) + this.bitmapX;


            //
                    // Render data depending on display enable state.
                    if (this.bitmapX >= 0 && this.bitmapX < 1024 && this.bitmapY < 625) {
                        var doubledLines = false;

                        if ((this.dispEnabled & EVERYTHINGENABLED) === EVERYTHINGENABLED) {
                            this.blitPixels(this.video.fb32, dat, offset, mode);

                        //     if ((mode & 0x10 ) == 0) // MODE_AG - bit 4; 0x10 is the AG bit
                        //         // TODO: Add in the INTEXT modifiers to mode (if necessary)
                        //         // blit into the fb32 buffer which is painted by VIDEO
                        //         this.blitChar(this.video.fb32, dat, offset, this.pixelsPerChar, mode);
                        //     else
                        //         this.blitPixels(this.video.fb32, dat, offset, mode);
                        }
                    }
                }
                else
                    // outside border
                {
                    var offset = this.bitmapY;
                    offset = (offset * 1024) + this.bitmapX;
                    if (!insideBorder) {
                        // this.blitPixels(this.video.fb32, this.dispEnabled & 0xff, offset, mode);
                        this.blitPixels(this.video.fb32, (this.bitmapY) & 0xff, offset, mode);
                    }
                }

                // CRTC MA always increments, inside display border or not.
                // maximum 8k on ATOM
                this.addr = (this.addr + 1) & 0x1fff;


                // The Hitachi 6845 decides to end (or never enter) vertical
                // adjust here, one clock after checking whether to enter
                // vertical adjust.
                // In a normal frame, this is C0=2.
                if (this.checkVertAdjust) {
                    this.checkVertAdjust = false;
                    if (this.endOfMainLatched) {
                        if (this.vertAdjustCounter === regs5) {  /// regs[5] - 0x02
                            this.endOfVertAdjustLatched = true;
                        }
                        this.vertAdjustCounter++;
                        this.vertAdjustCounter &= 0x1f;
                    }
                }

                if (this.horizCounter === 1) {
                    if (this.vertCounter === regs4 &&  // end of vertical  // regs4	Vertical Total
                        this.scanlineCounter === this.regs[9]) {  // end of last scanline on vertical too  // regs9  - scanlines per char
                        this.endOfMainLatched = true;
                        this.vertAdjustCounter = 0;

                    }
                    // The very next cycle (be it on this same scanline or the
                    // next) is used for checking the vertical adjust counter.
                    this.checkVertAdjust = true;

                }


                //256 pixels across which is 32 bytes - 256 bits
                if (this.horizCounter === regs0) {  // regs0	Horizontal Total
                    this.endofScanline();  // update this.addr in here from this.lineStartAddr
                    this.horizCounter = 0;
                    this.dispEnableSet(HDISPENABLE);
                } else {
                    this.horizCounter = (this.horizCounter + 1) & 0xff;
                }


                var r6Hit = (this.vertCounter === regs6);  // regs6	Vertical Displayed
                if (r6Hit &&
                    !this.firstScanline &&
                    (this.dispEnabled & VDISPENABLE)) {
                    this.dispEnableClear(VDISPENABLE);
                    // Perhaps surprisingly, this happens here. Both cursor
                    // blink and interlace cease if R6 > R4.
                    this.frameCount++;
                }
            } // matches while
        };



        this.levelDEW = false;
        this.levelDISPTMG = false;
        this.scanlineCounterT = 0;

        this.setDEW = function (level) {
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

            this.scanlineCounterT = 0;
        };


        this.setDISPTMG = function (level) {
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

            this.scanlineCounterT++;
            // Check for end of character row.
            if (this.scanlineCounterT === 12) {
                this.scanlineCounterT = 0;
            }

        };



        this.blitPixels = function ( buf, data, destOffset, mode)
        {
            var scanline = this.scanlineCounterT;
            var css = (mode & 0x08) >>> 2;
            // bitpattern from data is either 4 or 8 pixels in raw graphics
            // either white and black
            // or 3 colours and black (in pairs of bits)
            // that is: all graphics modes are 1bpp or 2bpp giving 2 colours or 4 colours
            mode |= 0;
            var css = (mode & 0x08) >>> 2;

            var bitdef = data;
            var pixelsPerBit = this.pixelsPerBit;
            var bpp = this.bpp;
            var colour = 0xffffffff; //white  - see 'collook'  // alpha, blue, green, red


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



        this.blitChar = function ( buf, data, destOffset, numPixels, mode)
        {
            // var scanline = this.scanlineCounterT;
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
