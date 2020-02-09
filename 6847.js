define(['./6847_fontdata', './utils'], function (fontData, utils) {
    "use strict";

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


    Video6847.prototype.blitChar = function ( buf, data, destOffset, numPixels )
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
